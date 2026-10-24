/**
 * Units layer (spec 11.7): the committed GLB models (style pilot #66 and the model
 * issues #67/#68/#70/#71 and later), with the greybox capsule as the asynchronous
 * loading and not-yet-modelled fallback.
 *
 * Two animation systems run on every unit:
 * - Blender clips through `models.ts`: idle/walk loop, attack/eat on the sim
 *   `attack` event, produce on a producer's orb spawn and victory on `levelWon`.
 * - Procedural code animations of spec 9.6 (spawn drop + squash, hit squash,
 *   death shrink + spin, merge jump + spin) plus the small dust/poof/star
 *   particle bursts of `particles.ts`.
 *
 * The interpolation root only carries the sim position (spec 11.4); the visual
 * child carries the star scale and the procedural transforms, so a spawn drop or
 * death spin never fights the tick interpolation. The render loop does not
 * allocate: the animation curves write into per-unit scratch objects and the
 * particle system uses fixed buffers.
 */

import { CapsuleGeometry, Group, Mesh, MeshToonMaterial } from 'three';

import { defenderById, enemyById, rules } from '../data';
import { starModelScale } from '../sim/stars';
import type { DefenderState, EnemyState } from '../sim/types';
import { createBlobShadow } from './blobShadow';
import { readDebugAnimationHold, type DebugAnimationHold } from './debugAnimation';
import { defenderColor, enemyColor } from './greyboxPalette';
import {
  createPilotModels,
  createModelInstance,
  PILOT_MODEL_IDS,
  type ModelInstance,
} from './models';
import { addOutline } from './outline';
import { createParticleBursts, type ParticleBursts } from './particles';
import {
  animationProgress,
  DEATH_DURATION_MS,
  DEATH_POOF_FRACTION,
  deathScale,
  deathSpin,
  eatTimeScale,
  HIT_DURATION_MS,
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
} from './proceduralAnimations';
import { createToonMaterial } from './toonMaterial';
import { InterpolatedObjects } from './viewMap';
import { columnToWorldX, laneToWorldZ, simXToWorldX } from './worldMapping';

/** Capsule size: about 0.9 tiles tall and inside one tile (spec 9.3). */
const CAPSULE_RADIUS = 0.28 * rules.grid.tileSize;
const CAPSULE_LENGTH = 0.34 * rules.grid.tileSize;
const CAPSULE_CENTER_Y = CAPSULE_RADIUS + CAPSULE_LENGTH / 2;

/** Blob shadow width of spec 9.2 (0.7 units), shared by every unit. */
const BLOB_SHADOW_WIDTH = 0.7;

/** Fly height of a flying enemy in world units (spec 6.2: the Bat Swarm flies at 1.5). */
const FLYING_HEIGHT = 1.5;

/**
 * Render height of an enemy above its lane plane (spec 6.2). Flying enemies hover at
 * 1.5 units; every other enemy and all defenders stay on the ground. Data-driven from
 * `EnemyDef.isFlying` so the renderer never hardcodes enemy ids.
 */
export function enemyRenderHeight(enemyId: string): number {
  return enemyById[enemyId]?.isFlying === true ? FLYING_HEIGHT : 0;
}

/** White flash colour mixed into the material emissive channel for 0.08 s (spec 9.2). */
const HIT_FLASH_COLOR = 0xffffff;

/** The model ids that have a real GLB in public/models/ (issue #66 onwards). */
const MODEL_IDS = new Set<string>(PILOT_MODEL_IDS);

/** Tolerance when matching a producer orb spawn to the producer's tile (spec 3.3). */
const PRODUCER_TILE_TOLERANCE = 0.05;

/** One spawned unit: the interpolated root, the animated visual child and its state. */
interface UnitRecord {
  readonly root: Group;
  readonly visual: Group;
  readonly kind: 'defender' | 'enemy';
  readonly modelId: string;
  readonly lane: number;
  readonly col: number | null;
  readonly shadow: Mesh;
  readonly spawnScale: ScalePair;
  readonly hitScale: ScalePair;
  capsule: Mesh | null;
  capsuleMaterial: MeshToonMaterial | null;
  capsuleOutline: Mesh | null;
  instance: ModelInstance | null;
  pendingModel: boolean;
  stars: 1 | 2 | 3;
  baseScale: number;
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
  walkRate: number;
}

/** Options of the unit layer; the debug hold is only used by screenshot runs. */
export interface UnitLayerOptions {
  readonly debugAnimationHold?: DebugAnimationHold | null;
}

/** Unit models for defenders and enemies, driven by the sim events (spec 11.7). */
export interface UnitLayer {
  spawnDefender(id: number, defenderId: string, lane: number, col: number, stars: 1 | 2 | 3): void;
  spawnEnemy(id: number, enemyId: string, lane: number, x: number): void;
  /** Starts the 0.5 s merge jump/spin/grow of a defender raising its star level (spec 9.6). */
  merge(id: number, stars: 1 | 2 | 3): void;
  /** Starts the 0.4 s death animation; the unit is removed when it ends (spec 9.6, 11.7). */
  die(id: number): void;
  /** Flashes one unit white for 0.08 s and squashes it for 0.15 s (spec 9.2, 9.6). */
  flash(id: number): void;
  /** Plays the attack clip of an attacker, or the eat clip of an enemy (spec 12.5). */
  playAttack(id: number): void;
  /** Plays the produce clip of the producer on this tile (spec 9.6). */
  playProduceAt(lane: number, x: number): void;
  /** Plays the victory clip of every living defender (spec 9.6). */
  playVictory(): void;
  sync(defenders: readonly DefenderState[], enemies: readonly EnemyState[]): void;
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the model/procedural-animation layer; the layer owns its group and cleans it up. */
export function createUnitLayer(parent: Group, options: UnitLayerOptions = {}): UnitLayer {
  const capsuleGeometry = new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 4, 12);
  capsuleGeometry.translate(0, CAPSULE_CENTER_Y, 0);
  const models = createPilotModels();
  const particles: ParticleBursts = createParticleBursts();
  parent.add(particles.object);
  const objects = new InterpolatedObjects();
  const records = new Map<number, UnitRecord>();
  const removals: number[] = [];
  const debugHold =
    options.debugAnimationHold === undefined
      ? readDebugAnimationHold(window.location.search)
      : options.debugAnimationHold;
  let lastUpdateMs = performance.now();
  let disposed = false;

  /** True when the screenshot debug hold controls this animation of this unit. */
  function isHeld(kind: DebugAnimationHold['kind'], record: UnitRecord): boolean {
    if (debugHold === null || debugHold.kind !== kind) {
      return false;
    }
    // The spawn hold is for defender drop-in stills; frozen enemies would clutter them.
    return kind !== 'spawn' || record.kind === 'defender';
  }

  /** Progress of one procedural animation, honouring the debug screenshot hold. */
  function progressOf(
    kind: DebugAnimationHold['kind'],
    record: UnitRecord,
    startMs: number,
    durationMs: number,
    nowMs: number,
  ): number {
    if (isHeld(kind, record)) {
      return debugHold?.progress ?? 0;
    }
    return animationProgress(nowMs - startMs, durationMs);
  }

  /** Removes the capsule fallback and frees its per-unit resources. */
  function removeCapsule(record: UnitRecord): void {
    if (record.capsule === null) {
      return;
    }
    record.visual.remove(record.capsule);
    record.capsuleMaterial?.dispose();
    record.capsuleOutline?.geometry.dispose();
    record.capsule = null;
    record.capsuleMaterial = null;
    record.capsuleOutline = null;
  }

  /** Adds the capsule fallback in the faction colour of the unit. */
  function addCapsule(record: UnitRecord): void {
    const color =
      record.kind === 'defender' ? defenderColor(record.modelId) : enemyColor(record.modelId);
    const material = createToonMaterial(color);
    const mesh = new Mesh(capsuleGeometry, material);
    const outline = addOutline(mesh);
    record.visual.add(mesh);
    record.capsule = mesh;
    record.capsuleMaterial = material;
    record.capsuleOutline = outline;
  }

  /** Swaps the capsule for the loaded model; returns false when the model is unavailable. */
  function addModel(record: UnitRecord): boolean {
    const asset = models.get(record.modelId);
    if (asset === null) {
      return false;
    }
    const instance = createModelInstance(asset);
    if (instance === null) {
      return false;
    }
    removeCapsule(record);
    record.instance = instance;
    record.visual.add(instance.object);
    instance.playBase(record.kind === 'enemy' ? 'walk' : 'idle');
    instance.setBasePlaybackRate(record.walkRate);
    return true;
  }

  /** Creates one unit root, its visual child and the initial procedural state. */
  function addUnit(
    id: number,
    kind: 'defender' | 'enemy',
    modelId: string,
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
    root.name = `${kind}:${modelId}`;
    // Spec 9.1/12.5: characters face +X; the renderer turns enemies 180 degrees.
    if (kind === 'enemy') {
      root.rotation.y = Math.PI;
    }
    const visual = new Group();
    visual.name = `${kind}:${modelId}:visual`;
    root.add(visual);
    const shadow = createBlobShadow(BLOB_SHADOW_WIDTH, BLOB_SHADOW_WIDTH);
    root.add(shadow);
    parent.add(root);
    const height = kind === 'enemy' ? enemyRenderHeight(modelId) : 0;
    // The blob shadow stays on the ground below a flying enemy (spec 9.2).
    shadow.position.y = 0.012 - height;
    objects.add(id, root, x, height, z);
    const now = performance.now();
    const record: UnitRecord = {
      root,
      visual,
      kind,
      modelId,
      lane,
      col,
      shadow,
      spawnScale: { xz: 1, y: 1 },
      hitScale: { xz: 1, y: 1 },
      capsule: null,
      capsuleMaterial: null,
      capsuleOutline: null,
      instance: null,
      pendingModel: false,
      stars,
      baseScale: starModelScale(stars),
      spawnStartMs: now,
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
      walkRate,
    };
    records.set(id, record);
    const hasModel = MODEL_IDS.has(modelId);
    if (hasModel && addModel(record)) {
      return;
    }
    addCapsule(record);
    record.pendingModel = hasModel;
  }

  /** Resets the white hit flash of one unit. */
  function clearFlash(record: UnitRecord): void {
    record.instance?.setFlash(false);
    if (record.capsuleMaterial !== null) {
      record.capsuleMaterial.emissive.setHex(0x000000);
      record.capsuleMaterial.emissiveIntensity = 0;
    }
    record.flashEndsAtMs = 0;
  }

  /** Detaches and forgets one unit, freeing its per-unit resources. */
  function removeUnit(id: number): void {
    objects.remove(id);
    const record = records.get(id);
    if (record === undefined) {
      return;
    }
    parent.remove(record.root);
    removeCapsule(record);
    record.shadow.geometry.dispose();
    if (!Array.isArray(record.shadow.material)) {
      record.shadow.material.dispose();
    }
    record.instance?.dispose();
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

  /** Applies the spec 9.6 procedural transforms of one unit for the current frame. */
  function applyProceduralAnimation(record: UnitRecord, nowMs: number): void {
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

    let scale = record.baseScale;
    let scaleXZ = 1;
    let scaleY = 1;
    let offsetY = 0;
    let spin = 0;

    if (record.dying) {
      scale *= deathScale(deathProgress);
      spin = deathSpin(deathProgress);
      if (!record.deathBurstDone && deathProgress >= DEATH_POOF_FRACTION) {
        record.deathBurstDone = true;
        particles.burst(
          record.kind === 'enemy' ? 'death_enemy' : 'death_defender',
          record.root.position.x,
          record.root.position.y + 0.4,
          record.root.position.z,
        );
      }
      record.deathComplete = deathProgress >= 1;
    } else {
      if (record.mergeActive) {
        scale = mergeScale(mergeProgress, record.mergeFromScale, record.baseScale);
        offsetY += mergeJumpY(mergeProgress);
        spin += mergeSpin(mergeProgress);
        if (!record.mergeBurstDone && mergeProgress >= MERGE_BURST_FRACTION) {
          record.mergeBurstDone = true;
          particles.burst(
            'merge_star',
            record.root.position.x,
            record.root.position.y + 0.6,
            record.root.position.z,
          );
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
          particles.burst(
            'spawn_dust',
            record.root.position.x,
            record.root.position.y + 0.05,
            record.root.position.z,
          );
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

    record.visual.scale.set(scale * scaleXZ, scale * scaleY, scale * scaleXZ);
    record.visual.position.y = offsetY;
    record.visual.rotation.y = spin;
  }

  // Models load asynchronously; swap every placeholder that is waiting for one.
  models.ready.then(() => {
    if (disposed) {
      return;
    }
    for (const record of records.values()) {
      if (record.pendingModel) {
        record.pendingModel = !addModel(record);
      }
    }
  });

  return {
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
      const definition = enemyById[enemyId];
      const walkRate = definition === undefined ? 1 : walkPlaybackRate(definition.speed);
      addUnit(id, 'enemy', enemyId, lane, null, simXToWorldX(x), laneToWorldZ(lane), 1, walkRate);
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
      clearFlash(record);
    },
    flash: (id): void => {
      const record = records.get(id);
      if (record === undefined || record.dying) {
        return;
      }
      if (record.instance !== null) {
        record.instance.setFlash(true);
      } else if (record.capsuleMaterial !== null) {
        record.capsuleMaterial.emissive.setHex(HIT_FLASH_COLOR);
        record.capsuleMaterial.emissiveIntensity = 1;
      }
      const now = performance.now();
      record.flashEndsAtMs = now + 80;
      record.hitStartMs = now;
      record.hitActive = true;
    },
    playAttack: (id): void => {
      const record = records.get(id);
      if (record === undefined || record.instance === null) {
        return;
      }
      if (record.kind === 'enemy') {
        const definition = enemyById[record.modelId];
        const interval = definition?.biteIntervalS;
        const clipDuration = record.instance.clipDuration('eat');
        const timeScale = interval === undefined ? 1 : eatTimeScale(interval, clipDuration);
        record.instance.playOneShot('eat', timeScale);
      } else {
        record.instance.playOneShot('attack');
      }
    },
    playProduceAt: (lane, x): void => {
      for (const record of records.values()) {
        if (record.kind !== 'defender' || record.dying || record.instance === null) {
          continue;
        }
        const definition = defenderById[record.modelId];
        if (definition?.pattern !== 'producer' || record.lane !== lane) {
          continue;
        }
        if (Math.abs(record.root.position.x - x) > PRODUCER_TILE_TOLERANCE) {
          continue;
        }
        record.instance.playOneShot('produce');
        return;
      }
    },
    playVictory: (): void => {
      for (const record of records.values()) {
        if (record.kind === 'defender' && !record.dying) {
          record.instance?.playOneShot('victory');
        }
      }
    },
    sync: (defenders, enemies): void => {
      const seen = new Set<number>();
      for (const defender of defenders) {
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
      for (const enemy of enemies) {
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
            record.instance?.setBasePlaybackRate(walkRate);
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
      removals.length = 0;
      for (const [id, record] of records) {
        record.instance?.update(deltaSeconds);
        applyProceduralAnimation(record, now);
        if (record.flashEndsAtMs > 0 && now >= record.flashEndsAtMs) {
          clearFlash(record);
        }
        if (record.dying && record.deathComplete) {
          removals.push(id);
        }
      }
      for (const id of removals) {
        removeUnit(id);
      }
      particles.update(deltaSeconds);
    },
    dispose: (): void => {
      disposed = true;
      parent.clear();
      capsuleGeometry.dispose();
      for (const record of records.values()) {
        record.capsuleMaterial?.dispose();
        record.capsuleOutline?.geometry.dispose();
        record.shadow.geometry.dispose();
        if (!Array.isArray(record.shadow.material)) {
          record.shadow.material.dispose();
        }
        record.instance?.dispose();
      }
      records.clear();
      removals.length = 0;
      particles.dispose();
      models.dispose();
    },
  };
}
