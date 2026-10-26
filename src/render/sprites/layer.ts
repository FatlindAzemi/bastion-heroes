/**
 * 2.5D sprite billboard unit layer (issue #114).
 *
 * Drop-in replacement for the GLB unit layer of `units.ts`: same `UnitLayer`
 * interface and the same sim/tick wiring, but every unit is an animated pixel-art
 * billboard cut from the sprite-forge atlases (`public/sprites/manifest.json`).
 * The geometry is a bottom-center anchored quad that copies the camera quaternion
 * every frame, so the sprites always face the portrait camera. The 9.6 procedural
 * animations (spawn drop/squash, hit squash, death spin/shrink, merge jump/spin) and
 * the 9.2 white hit flash run on top of the clip playback. The sprites are unlit and
 * opaque (`discard` for alpha), which keeps them in the fast opaque queue.
 *
 * Asset loading is asynchronous and failure tolerant: until the manifest/sheets
 * exist the layer draws nothing (the Lead keeps the 3D unit layer visible). With
 * the development `placeholderFallback` option it draws procedural placeholder
 * quads instead, which is how the layer was verified before the atlases landed.
 */
import { Group, Mesh, Quaternion, type Camera, type PlaneGeometry } from 'three';

import { defenderById, defenders, enemies, enemyById, rules } from '../../data';
import { starModelScale } from '../../sim/stars';
import type { EnemyState } from '../../sim/types';
import { readDebugAnimationHold, type DebugAnimationHold } from '../debugAnimation';
import {
  animationProgress,
  DEATH_DURATION_MS,
  DEATH_POOF_FRACTION,
  deathScale,
  deathSpin,
  eatTimeScale,
  HIT_DURATION_MS,
  HIT_FLASH_MS,
  hitScale,
  MERGE_BURST_FRACTION,
  MERGE_DURATION_MS,
  mergeJumpY,
  mergeScale,
  mergeSpin,
  SPAWN_DURATION_MS,
  SPAWN_LANDING_FRACTION,
  spawnOffsetY,
  spawnScale,
  walkPlaybackRate,
  type ScalePair,
} from '../proceduralAnimations';
import { enemyRenderHeight } from '../units';
import { columnToWorldX, laneToWorldZ, simXToWorldX } from '../worldMapping';
import { InterpolatedObjects } from '../viewMap';
import {
  billboardQuaternion,
  createBottomCenterQuad,
  resolveSpriteWorldScale,
  spriteWorldWidth,
} from './billboard';
import { clipDurationSeconds, clipFrameAt, frameUvRect, type UvRect } from './clip';
import { baseClipName, createPlaceholderManifest, resolveSpriteClip } from './manifest';
import { createSpriteMaterial, type SpriteMaterial } from './material';
import { createUnitShadows, type UnitShadows } from './shadows';
import { loadCharacterSheets, loadSpriteManifest, releaseCharacterSheets } from './sheets';
import type { CharacterSheets } from './sheets';
import type {
  SpriteClipName,
  SpriteSheetTexture,
  SpriteUnitLayer,
  SpriteUnitLayerOptions,
} from './types';

/** Tolerance when matching a producer orb spawn to the producer's tile (spec 3.3). */
const PRODUCER_TILE_TOLERANCE = 0.05;

/** Fallback shadow width of a unit whose sheet has not loaded yet, in world units. */
const FALLBACK_SHADOW_WIDTH = 0.6;

/** Width of a unit's ground shadow relative to the sprite width (spec 9.2). */
const SHADOW_WIDTH_FACTOR = 0.9;

/** A running one-shot clip (attack, eat, produce, victory) over the base loop. */
interface OneShotClip {
  readonly clip: SpriteClipName;
  readonly rate: number;
  readonly duration: number;
  elapsed: number;
}

/** One spawned unit: interpolated root, procedural visual child and its billboard. */
interface SpriteRecord {
  readonly root: Group;
  readonly visual: Group;
  readonly kind: 'defender' | 'enemy';
  readonly characterId: string;
  readonly lane: number;
  readonly col: number | null;
  readonly spawnScale: ScalePair;
  readonly hitScale: ScalePair;
  sheet: SpriteSheetTexture | null;
  mesh: Mesh | null;
  material: SpriteMaterial | null;
  stars: 1 | 2 | 3;
  baseScale: number;
  baseClock: number;
  walkRate: number;
  oneShot: OneShotClip | null;
  spawnStartMs: number;
  spawnActive: boolean;
  spawnBurstDone: boolean;
  hitStartMs: number;
  hitActive: boolean;
  flashEndsAtMs: number;
  mergeStartMs: number;
  mergeActive: boolean;
  mergeFromScale: number;
  mergeBurstDone: boolean;
  deathStartMs: number;
  dying: boolean;
  deathBurstDone: boolean;
  deathComplete: boolean;
  shadowBaseWidth: number;
  shadowWidth: number;
}

/** The pose a unit's billboard takes this frame: screen-plane scale, offset and roll. */
interface SpritePose {
  scaleX: number;
  scaleY: number;
  offsetY: number;
  roll: number;
  shadowScale: number;
}

/** The data ids of every unit in the roster, used by the placeholder fallback. */
function rosterIds(): string[] {
  return [...defenders.map((defender) => defender.id), ...enemies.map((enemy) => enemy.id)];
}

/**
 * Creates the sprite billboard layer under `parent`; the layer owns a child group
 * and everything below it and cleans all of it up in `dispose`.
 */
export function createSpriteUnitLayer(
  parent: Group,
  options: SpriteUnitLayerOptions = {},
): SpriteUnitLayer {
  const layerGroup = new Group();
  layerGroup.name = 'spriteUnitLayer';
  parent.add(layerGroup);

  const objects = new InterpolatedObjects();
  const records = new Map<number, SpriteRecord>();
  const removals: number[] = [];
  const geometries = new Map<string, PlaneGeometry>();
  const uvScratch: UvRect = { u0: 0, v0: 0, u1: 0, v1: 0 };
  const cameraQuaternion = new Quaternion();
  const shadows: UnitShadows = createUnitShadows();
  layerGroup.add(shadows.object);

  const particles = options.particles ?? null;
  const debugHold =
    options.debugAnimationHold === undefined
      ? readDebugAnimationHold(window.location.search)
      : options.debugAnimationHold;
  const manifestUrl = options.manifestUrl ?? `${import.meta.env.BASE_URL}sprites/manifest.json`;
  const placeholderFallback = options.placeholderFallback === true;
  // Readability multiplier of the manifest world heights (default 1.25, floor 1.0).
  const worldScale = resolveSpriteWorldScale(options.worldScale);

  let camera: Camera | null = options.camera ?? null;
  let characterSheets: CharacterSheets = new Map();
  let loadedCharacters: ReadonlySet<string> = new Set();
  let available = false;
  let disposed = false;
  let warnedMissingCamera = false;
  let lastUpdateMs = performance.now();

  // -- loading ---------------------------------------------------------------

  /** Loads the manifest and sheets, falling back to placeholders when enabled. */
  async function loadAssets(): Promise<boolean> {
    const manifest = await loadSpriteManifest(manifestUrl);
    if (disposed) {
      return false;
    }
    const real =
      manifest === null
        ? new Map<string, SpriteSheetTexture>()
        : await loadCharacterSheets(manifest);
    if (disposed) {
      releaseCharacterSheets(real);
      return false;
    }
    let sheets = real;
    if (sheets.size === 0 && placeholderFallback) {
      sheets = await loadCharacterSheets(createPlaceholderManifest(rosterIds()));
    }
    if (disposed) {
      releaseCharacterSheets(sheets);
      return false;
    }
    characterSheets = sheets;
    loadedCharacters = new Set(characterSheets.keys());
    for (const record of records.values()) {
      attachSheet(record);
    }
    available = characterSheets.size > 0;
    options.onReady?.(available);
    return available;
  }

  const ready = loadAssets().catch((): boolean => false);

  // -- geometry and sheet attachment ----------------------------------------

  /** Scaled world height of one character: manifest height times the layer world scale. */
  function scaledHeightOf(character: SpriteSheetTexture['character']): number {
    return character.worldHeight * worldScale;
  }

  /**
   * Cached bottom-center quad of one character (same size for all its units). The
   * quad is sunk by the measured transparent frame padding, so the visible content
   * bottom stands on the sim ground point instead of floating above it.
   */
  function geometryFor(sheet: SpriteSheetTexture, characterId: string): PlaneGeometry {
    const cached = geometries.get(characterId);
    if (cached !== undefined) {
      return cached;
    }
    const character = sheet.character;
    const height = scaledHeightOf(character);
    const width = spriteWorldWidth(height, character.frameWidth, character.frameHeight);
    const geometry = createBottomCenterQuad(width, height, height * sheet.bottomInset);
    geometries.set(characterId, geometry);
    return geometry;
  }

  /** Camera-facing orientation of this frame; identity while no camera is set. */
  function readCameraQuaternion(): void {
    if (camera === null) {
      if (!warnedMissingCamera) {
        warnedMissingCamera = true;
        console.warn(
          'sprites: no camera yet, billboards face the default direction; ' +
            'pass options.camera or call setCamera(camera)',
        );
      }
      cameraQuaternion.identity();
      return;
    }
    camera.getWorldQuaternion(cameraQuaternion);
  }

  /** Attaches the billboard mesh once the sheet of this character is available. */
  function attachSheet(record: SpriteRecord): void {
    if (record.mesh !== null) {
      return;
    }
    const sheet = characterSheets.get(record.characterId);
    if (sheet === undefined) {
      return;
    }
    const character = sheet.character;
    const material = createSpriteMaterial(sheet.texture);
    const mesh = new Mesh(geometryFor(sheet, record.characterId), material.material);
    mesh.name = `sprite:${record.characterId}`;
    // A screen-aligned quad never needs bounding-sphere culling; ~40 units visible.
    mesh.frustumCulled = false;
    readCameraQuaternion();
    billboardQuaternion(mesh.quaternion, cameraQuaternion, 0);
    record.sheet = sheet;
    record.material = material;
    record.mesh = mesh;
    record.shadowBaseWidth = Math.max(
      FALLBACK_SHADOW_WIDTH,
      spriteWorldWidth(scaledHeightOf(character), character.frameWidth, character.frameHeight) *
        SHADOW_WIDTH_FACTOR,
    );
    record.shadowWidth = record.shadowBaseWidth;
    record.visual.add(mesh);
    updateClipFrame(record, 0);
  }

  // -- unit lifecycle --------------------------------------------------------

  /** Creates one unit root, its visual child and its initial procedural state. */
  function addUnit(
    id: number,
    kind: 'defender' | 'enemy',
    characterId: string,
    lane: number,
    col: number | null,
    x: number,
    z: number,
    stars: 1 | 2 | 3,
    walkRate: number,
  ): void {
    if (objects.has(id)) {
      return;
    }
    const root = new Group();
    root.name = `sprite:${kind}:${characterId}`;
    const visual = new Group();
    visual.name = 'visual';
    root.add(visual);
    layerGroup.add(root);
    const height = kind === 'enemy' ? enemyRenderHeight(characterId) : 0;
    objects.add(id, root, x, height, z);
    const record: SpriteRecord = {
      root,
      visual,
      kind,
      characterId,
      lane,
      col,
      spawnScale: { xz: 1, y: 1 },
      hitScale: { xz: 1, y: 1 },
      sheet: null,
      mesh: null,
      material: null,
      stars,
      baseScale: starModelScale(stars),
      baseClock: 0,
      walkRate,
      oneShot: null,
      spawnStartMs: performance.now(),
      spawnActive: true,
      spawnBurstDone: false,
      hitStartMs: 0,
      hitActive: false,
      flashEndsAtMs: 0,
      mergeStartMs: 0,
      mergeActive: false,
      mergeFromScale: starModelScale(stars),
      mergeBurstDone: true,
      deathStartMs: 0,
      dying: false,
      deathBurstDone: true,
      deathComplete: false,
      shadowBaseWidth: FALLBACK_SHADOW_WIDTH,
      shadowWidth: FALLBACK_SHADOW_WIDTH,
    };
    records.set(id, record);
    attachSheet(record);
  }

  /** Detaches and forgets one unit, freeing its per-unit resources. */
  function removeUnit(id: number): void {
    objects.remove(id);
    const record = records.get(id);
    if (record === undefined) {
      return;
    }
    layerGroup.remove(record.root);
    record.material?.dispose();
    records.delete(id);
  }

  /** Removes units whose sim entity disappeared, except the ones still dying (spec 11.7). */
  function removeMissing(seen: ReadonlySet<number>): void {
    for (const id of [...objects.ids()]) {
      const record = records.get(id);
      if (record?.dying === true) {
        continue;
      }
      if (!seen.has(id)) {
        removeUnit(id);
      }
    }
  }

  // -- procedural animations (spec 9.6) -------------------------------------

  /** True when the screenshot debug hold controls this animation of this unit. */
  function isHeld(kind: DebugAnimationHold['kind'], record: SpriteRecord): boolean {
    if (debugHold === null || debugHold.kind !== kind) {
      return false;
    }
    return kind !== 'spawn' || record.kind === 'defender';
  }

  /** Progress of one procedural animation, honouring the debug screenshot hold. */
  function progressOf(
    kind: DebugAnimationHold['kind'],
    record: SpriteRecord,
    startMs: number,
    durationMs: number,
    nowMs: number,
  ): number {
    if (isHeld(kind, record)) {
      return debugHold?.progress ?? 0;
    }
    return animationProgress(nowMs - startMs, durationMs);
  }

  /** Fires one burst through the shared particle system of the level (if provided). */
  function burst(
    kind: 'spawn_dust' | 'death_poof_enemy' | 'death_poof_defender' | 'merge_star',
    record: SpriteRecord,
    height: number,
  ): void {
    particles?.burst(
      kind,
      record.root.position.x,
      record.root.position.y + height,
      record.root.position.z,
    );
  }

  /** Applies the spec 9.6 procedural scale/offset/roll of one unit for this frame. */
  function applyProceduralAnimation(
    record: SpriteRecord,
    nowMs: number,
    billboardCamera: Quaternion,
  ): void {
    const spawnProgress = record.spawnActive
      ? progressOf('spawn', record, record.spawnStartMs, SPAWN_DURATION_MS, nowMs)
      : 0;
    const hitProgress = record.hitActive
      ? progressOf('hit', record, record.hitStartMs, HIT_DURATION_MS, nowMs)
      : 0;
    const mergeProgress = record.mergeActive
      ? progressOf('merge', record, record.mergeStartMs, MERGE_DURATION_MS, nowMs)
      : 0;
    const deathProgress = record.dying
      ? progressOf('death', record, record.deathStartMs, DEATH_DURATION_MS, nowMs)
      : 0;
    const pose = proceduralPose(record, spawnProgress, hitProgress, mergeProgress, deathProgress);
    record.shadowWidth = record.shadowBaseWidth * pose.shadowScale;
    record.visual.position.y = pose.offsetY;
    const mesh = record.mesh;
    if (mesh === null) {
      return;
    }
    mesh.scale.set(pose.scaleX, pose.scaleY, 1);
    billboardQuaternion(mesh.quaternion, billboardCamera, pose.roll);
  }

  /** Pose of one unit: scale factors, jump offset, screen-plane roll and shadow scale. */
  function proceduralPose(
    record: SpriteRecord,
    spawnProgress: number,
    hitProgress: number,
    mergeProgress: number,
    deathProgress: number,
  ): SpritePose {
    let scale = record.baseScale;
    let scaleXZ = 1;
    let scaleY = 1;
    let offsetY = 0;
    let roll = 0;
    let shadowScale = 1;
    if (record.dying) {
      shadowScale = Math.max(deathScale(deathProgress), 0);
      scale *= shadowScale;
      roll = deathSpin(deathProgress);
      if (!record.deathBurstDone && deathProgress >= DEATH_POOF_FRACTION) {
        record.deathBurstDone = true;
        burst(record.kind === 'enemy' ? 'death_poof_enemy' : 'death_poof_defender', record, 0.4);
      }
      record.deathComplete = deathProgress >= 1;
    } else {
      if (record.mergeActive) {
        scale = mergeScale(mergeProgress, record.mergeFromScale, record.baseScale);
        offsetY += mergeJumpY(mergeProgress);
        roll += mergeSpin(mergeProgress);
        shadowScale = 1 - 0.2 * Math.sin(Math.PI * Math.min(Math.max(mergeProgress, 0), 1));
        if (!record.mergeBurstDone && mergeProgress >= MERGE_BURST_FRACTION) {
          record.mergeBurstDone = true;
          burst('merge_star', record, 0.6);
        }
        if (mergeProgress >= 1) {
          record.mergeActive = false;
        }
      }
      if (record.spawnActive) {
        spawnScale(spawnProgress, record.spawnScale);
        scaleXZ *= record.spawnScale.xz;
        scaleY *= record.spawnScale.y;
        offsetY += spawnOffsetY(spawnProgress);
        if (!record.spawnBurstDone && spawnProgress >= SPAWN_LANDING_FRACTION) {
          record.spawnBurstDone = true;
          burst('spawn_dust', record, 0.05);
        }
        if (spawnProgress >= 1) {
          record.spawnActive = false;
        }
      }
      if (record.hitActive) {
        hitScale(hitProgress, record.hitScale);
        scaleXZ *= record.hitScale.xz;
        scaleY *= record.hitScale.y;
        if (hitProgress >= 1) {
          record.hitActive = false;
        }
      }
    }
    return { scaleX: scale * scaleXZ, scaleY: scale * scaleY, offsetY, roll, shadowScale };
  }

  // -- clip playback ---------------------------------------------------------

  /** Advances the clip clocks and writes the current atlas frame into the shader. */
  function updateClipFrame(record: SpriteRecord, deltaSeconds: number): void {
    const sheet = record.sheet;
    const material = record.material;
    if (sheet === null || material === null) {
      return;
    }
    const baseRate = record.kind === 'enemy' ? record.walkRate : 1;
    record.baseClock += deltaSeconds * baseRate;
    const clipState = advanceOneShot(record, deltaSeconds, baseRate);
    const clip = resolveSpriteClip(sheet.character, clipState.clip);
    if (clip === null) {
      return;
    }
    const frame = clipFrameAt(clip, clipState.elapsed, clipState.rate);
    const character = sheet.character;
    frameUvRect(
      frame,
      character.columns,
      character.frameWidth,
      character.frameHeight,
      sheet.sheetWidth,
      sheet.sheetHeight,
      uvScratch,
    );
    material.uvRect.set(
      uvScratch.u0,
      uvScratch.v0,
      uvScratch.u1 - uvScratch.u0,
      uvScratch.v1 - uvScratch.v0,
    );
  }

  /** Advances a running one-shot and returns the clip state to sample this frame. */
  function advanceOneShot(
    record: SpriteRecord,
    deltaSeconds: number,
    baseRate: number,
  ): { clip: SpriteClipName; elapsed: number; rate: number } {
    const oneShot = record.oneShot;
    if (oneShot === null) {
      return { clip: baseClipName(record.kind), elapsed: record.baseClock, rate: baseRate };
    }
    oneShot.elapsed += deltaSeconds * oneShot.rate;
    if (oneShot.elapsed >= oneShot.duration) {
      record.oneShot = null;
      return { clip: baseClipName(record.kind), elapsed: record.baseClock, rate: baseRate };
    }
    return { clip: oneShot.clip, elapsed: oneShot.elapsed, rate: 1 };
  }

  /** Starts a one-shot clip by resolving the sheet clip and its real duration. */
  function playClip(record: SpriteRecord, name: SpriteClipName, rate = 1): void {
    const sheet = record.sheet;
    if (sheet === null || record.dying) {
      return;
    }
    const clip = resolveSpriteClip(sheet.character, name);
    if (clip === null) {
      return;
    }
    record.oneShot = { clip: name, rate, duration: clipDurationSeconds(clip, rate), elapsed: 0 };
  }

  // -- per-frame update ------------------------------------------------------

  /** Sets or clears the white hit flash uniform of spec 9.2. */
  function updateFlash(record: SpriteRecord, nowMs: number): void {
    if (record.flashEndsAtMs > 0 && nowMs >= record.flashEndsAtMs) {
      record.flashEndsAtMs = 0;
    }
    if (record.material !== null) {
      record.material.flash.value = record.flashEndsAtMs > 0 ? 1 : 0;
    }
  }

  /** Advances clip playback, procedural animation and the white hit flash. */
  function updateUnit(record: SpriteRecord, deltaSeconds: number, nowMs: number): void {
    updateClipFrame(record, deltaSeconds);
    applyProceduralAnimation(record, nowMs, cameraQuaternion);
    updateFlash(record, nowMs);
  }

  // -- sim side helpers ------------------------------------------------------

  /** Current walk playback rate of an enemy from its data speed and statuses (spec 9.6). */
  function enemyWalkRate(enemy: EnemyState): number {
    const definition = enemyById[enemy.enemyId];
    if (definition === undefined) {
      return 1;
    }
    const frozen = enemy.statuses.some(
      (status) => status.kind === 'freeze' || status.kind === 'stun',
    );
    if (frozen) {
      return 0;
    }
    const slowed = enemy.statuses.some((status) => status.kind === 'slow');
    const currentSpeed = slowed
      ? definition.speed * rules.status.slow.moveSpeedMultiplier
      : definition.speed;
    return walkPlaybackRate(currentSpeed);
  }

  /** Walk clip rate of a freshly spawned enemy, from its data speed only (spec 9.6). */
  function spawnWalkRate(enemyId: string): number {
    const definition = enemyById[enemyId];
    return definition === undefined ? 1 : walkPlaybackRate(definition.speed);
  }

  return {
    ready,
    get available(): boolean {
      return available;
    },
    get loadedCharacters(): ReadonlySet<string> {
      return loadedCharacters;
    },
    setCamera: (nextCamera): void => {
      camera = nextCamera;
    },
    spawnDefender: (id, defenderId, lane, col, stars): void => {
      addUnit(
        id,
        'defender',
        defenderId,
        lane,
        col,
        columnToWorldX(col),
        laneToWorldZ(lane),
        stars,
        1,
      );
    },
    spawnEnemy: (id, enemyId, lane, x): void => {
      const z = laneToWorldZ(lane);
      addUnit(id, 'enemy', enemyId, lane, null, simXToWorldX(x), z, 1, spawnWalkRate(enemyId));
    },
    merge: (id, stars): void => {
      const record = records.get(id);
      if (record === undefined || record.dying) {
        return;
      }
      record.mergeFromScale = record.baseScale;
      record.stars = stars;
      record.baseScale = starModelScale(stars);
      record.mergeStartMs = performance.now();
      record.mergeActive = true;
      record.mergeBurstDone = false;
    },
    die: (id): void => {
      const record = records.get(id);
      if (record === undefined || record.dying) {
        return;
      }
      record.dying = true;
      record.deathStartMs = performance.now();
      record.deathBurstDone = false;
      record.spawnActive = false;
      record.hitActive = false;
      record.oneShot = null;
      record.flashEndsAtMs = 0;
      if (record.material !== null) {
        record.material.flash.value = 0;
      }
    },
    flash: (id): void => {
      const record = records.get(id);
      if (record === undefined || record.dying) {
        return;
      }
      const now = performance.now();
      record.flashEndsAtMs = now + HIT_FLASH_MS;
      record.hitStartMs = now;
      record.hitActive = true;
    },
    playAttack: (id): void => {
      const record = records.get(id);
      if (record === undefined) {
        return;
      }
      if (record.kind === 'defender') {
        playClip(record, 'attack');
        return;
      }
      const definition = enemyById[record.characterId];
      const clip = record.sheet === null ? null : resolveSpriteClip(record.sheet.character, 'eat');
      const duration = clip === null ? 1 : clipDurationSeconds(clip);
      const rate =
        definition?.biteIntervalS === undefined
          ? 1
          : eatTimeScale(definition.biteIntervalS, duration);
      playClip(record, 'eat', rate);
    },
    playProduceAt: (lane, x): void => {
      const worldX = simXToWorldX(x);
      for (const record of records.values()) {
        if (record.kind !== 'defender' || record.dying) {
          continue;
        }
        const definition = defenderById[record.characterId];
        if (definition?.pattern !== 'producer' || record.lane !== lane) {
          continue;
        }
        if (Math.abs(record.root.position.x - worldX) > PRODUCER_TILE_TOLERANCE) {
          continue;
        }
        playClip(record, 'produce');
        return;
      }
    },
    playVictory: (): void => {
      for (const record of records.values()) {
        if (record.kind === 'defender' && !record.dying) {
          playClip(record, 'victory');
        }
      }
    },
    sync: (defenderStates, enemyStates): void => {
      const seen = new Set<number>();
      for (const defender of defenderStates) {
        seen.add(defender.id);
        const x = columnToWorldX(defender.col);
        const z = laneToWorldZ(defender.lane);
        if (objects.has(defender.id)) {
          objects.moveTo(defender.id, x, 0, z);
        } else {
          addUnit(
            defender.id,
            'defender',
            defender.defenderId,
            defender.lane,
            defender.col,
            x,
            z,
            defender.stars,
            1,
          );
        }
      }
      for (const enemy of enemyStates) {
        seen.add(enemy.id);
        const x = simXToWorldX(enemy.x);
        const z = laneToWorldZ(enemy.lane);
        const height = enemyRenderHeight(enemy.enemyId);
        if (objects.has(enemy.id)) {
          objects.moveTo(enemy.id, x, height, z);
          const record = records.get(enemy.id);
          const walkRate = enemyWalkRate(enemy);
          if (record !== undefined && record.walkRate !== walkRate) {
            record.walkRate = walkRate;
          }
        } else {
          addUnit(
            enemy.id,
            'enemy',
            enemy.enemyId,
            enemy.lane,
            null,
            x,
            z,
            1,
            enemyWalkRate(enemy),
          );
        }
      }
      removeMissing(seen);
    },
    apply: (alpha): void => {
      objects.apply(alpha);
      const now = performance.now();
      const deltaSeconds = Math.min(Math.max((now - lastUpdateMs) / 1000, 0), 0.1);
      lastUpdateMs = now;
      readCameraQuaternion();
      let shadowCount = 0;
      removals.length = 0;
      for (const [id, record] of records) {
        updateUnit(record, deltaSeconds, now);
        if (record.mesh !== null) {
          shadows.set(
            shadowCount,
            record.root.position.x,
            record.root.position.z,
            record.shadowWidth,
          );
          shadowCount += 1;
        }
        if (record.dying && record.deathComplete) {
          removals.push(id);
        }
      }
      shadows.commit(shadowCount);
      for (const id of removals) {
        removeUnit(id);
      }
    },
    dispose: (): void => {
      disposed = true;
      parent.remove(layerGroup);
      for (const record of records.values()) {
        record.material?.dispose();
      }
      records.clear();
      removals.length = 0;
      layerGroup.clear();
      for (const geometry of geometries.values()) {
        geometry.dispose();
      }
      geometries.clear();
      shadows.dispose();
      releaseCharacterSheets(characterSheets);
      characterSheets = new Map();
      loadedCharacters = new Set();
      available = false;
    },
  };
}
