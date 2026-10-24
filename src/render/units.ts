/**
 * Units layer (spec 11.7): the committed GLB models (style pilot #66, the M2
 * enemies #70), with the greybox capsule as the asynchronous-loading and
 * not-yet-modelled fallback.
 *
 * Spawned units get the real model as soon as it is loaded: until then they show
 * a capsule in the same faction colour, then swap in place (no flicker, no loop
 * stall). Models play `idle` for defenders and `walk` for enemies, `attack`/`eat`
 * on the sim `attack` event, `produce` on an Essence orb spawn and `victory` when
 * the level is won (spec 9.6, 12.5).
 */

import { CapsuleGeometry, Group, Mesh, MeshToonMaterial } from 'three';

import { enemyById } from '../data';
import { rules } from '../data/rules';
import { starModelScale } from '../sim/stars';
import type { DefenderState, EnemyState } from '../sim/types';
import { createBlobShadow } from './blobShadow';
import { defenderColor, enemyColor } from './greyboxPalette';
import {
  createPilotModels,
  createModelInstance,
  PILOT_MODEL_IDS,
  type ModelInstance,
} from './models';
import { addOutline } from './outline';
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

/** Hit flash duration of spec 9.2 (0.08 s). */
const HIT_FLASH_MS = 80;

/** White flash colour mixed into the material emissive channel for 0.08 s (spec 9.2). */
const HIT_FLASH_COLOR = 0xffffff;

/** The pilot ids that have a real model in public/models/ (issue #66). */
const PILOT_IDS = new Set<string>(PILOT_MODEL_IDS);

/** One spawned unit: the root that interpolates, and its current visual. */
interface UnitRecord {
  readonly root: Group;
  readonly kind: 'defender' | 'enemy';
  readonly modelId: string;
  capsule: Mesh | null;
  capsuleMaterial: MeshToonMaterial | null;
  capsuleOutline: Mesh | null;
  shadow: Mesh | null;
  instance: ModelInstance | null;
  pendingModel: boolean;
}

/** Unit models for defenders and enemies, driven by the sim events (spec 11.7). */
export interface UnitLayer {
  spawnDefender(id: number, defenderId: string, lane: number, col: number, stars: 1 | 2 | 3): void;
  spawnEnemy(id: number, enemyId: string, lane: number, x: number): void;
  setStars(id: number, stars: 1 | 2 | 3): void;
  remove(id: number): void;
  /** Flashes one unit white for 0.08 s (spec 9.2 hit flash). */
  flash(id: number): void;
  /** Plays the attack clip of an attacker, or the eat clip of an enemy (spec 12.5). */
  playAttack(id: number): void;
  /** Plays the produce clip of the producer units on an orb spawn (spec 9.6). */
  playProduce(): void;
  /** Plays the victory clip of every living defender (spec 9.6). */
  playVictory(): void;
  sync(defenders: readonly DefenderState[], enemies: readonly EnemyState[]): void;
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the model/capsule layer; the layer owns its group and cleans it up in `dispose`. */
export function createUnitLayer(parent: Group): UnitLayer {
  const capsuleGeometry = new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 4, 12);
  capsuleGeometry.translate(0, CAPSULE_CENTER_Y, 0);
  const models = createPilotModels();
  const objects = new InterpolatedObjects();
  const records = new Map<number, UnitRecord>();
  const flashEndsAt = new Map<number, number>();
  let lastUpdateMs = performance.now();
  let disposed = false;

  /** Removes the capsule fallback and frees its per-unit resources. */
  function removeCapsule(record: UnitRecord): void {
    if (record.capsule === null) {
      return;
    }
    record.root.remove(record.capsule);
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
    record.root.add(mesh);
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
    record.root.add(instance.object);
    instance.playBase(record.kind === 'enemy' ? 'walk' : 'idle');
    return true;
  }

  /** Creates one unit root and its visual, using the model when it is loaded already. */
  function addUnit(
    id: number,
    kind: 'defender' | 'enemy',
    modelId: string,
    x: number,
    z: number,
    stars: 1 | 2 | 3,
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
    root.scale.setScalar(starModelScale(stars));
    const shadow = createBlobShadow(BLOB_SHADOW_WIDTH, BLOB_SHADOW_WIDTH);
    root.add(shadow);
    parent.add(root);
    const height = kind === 'enemy' ? enemyRenderHeight(modelId) : 0;
    // The blob shadow stays on the ground below a flying enemy (spec 9.2).
    shadow.position.y = 0.012 - height;
    objects.add(id, root, x, height, z);
    const record: UnitRecord = {
      root,
      kind,
      modelId,
      capsule: null,
      capsuleMaterial: null,
      capsuleOutline: null,
      shadow,
      instance: null,
      pendingModel: false,
    };
    records.set(id, record);
    const isPilot = PILOT_IDS.has(modelId);
    if (isPilot && addModel(record)) {
      return;
    }
    addCapsule(record);
    record.pendingModel = isPilot;
  }

  /** Resets the flash of one unit. */
  function clearFlash(id: number): void {
    const record = records.get(id);
    if (record?.instance != null) {
      record.instance.setFlash(false);
    }
    const material = record?.capsuleMaterial;
    if (material != null) {
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
    flashEndsAt.delete(id);
  }

  /** Detaches and forgets one unit, freeing its per-unit resources. */
  function removeUnit(id: number): void {
    objects.remove(id);
    const record = records.get(id);
    if (record !== undefined) {
      parent.remove(record.root);
      removeCapsule(record);
      record.shadow?.geometry.dispose();
      if (record.shadow !== null && !Array.isArray(record.shadow.material)) {
        record.shadow.material.dispose();
      }
      record.instance?.dispose();
      records.delete(id);
    }
    clearFlash(id);
  }

  /** Removes units whose sim entity disappeared without a removal event (spec 11.7 safety). */
  function removeMissing(seen: ReadonlySet<number>): void {
    for (const id of [...objects.ids()]) {
      if (!seen.has(id)) {
        removeUnit(id);
      }
    }
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
      addUnit(id, 'defender', defenderId, columnToWorldX(col), laneToWorldZ(lane), stars);
    },
    spawnEnemy: (id, enemyId, lane, x): void => {
      addUnit(id, 'enemy', enemyId, simXToWorldX(x), laneToWorldZ(lane), 1);
    },
    setStars: (id, stars): void => {
      const record = records.get(id);
      record?.root.scale.setScalar(starModelScale(stars));
    },
    remove: removeUnit,
    flash: (id): void => {
      const record = records.get(id);
      if (record === undefined) {
        return;
      }
      if (record.instance !== null) {
        record.instance.setFlash(true);
      } else if (record.capsuleMaterial !== null) {
        record.capsuleMaterial.emissive.setHex(HIT_FLASH_COLOR);
        record.capsuleMaterial.emissiveIntensity = 1;
      }
      flashEndsAt.set(id, performance.now() + HIT_FLASH_MS);
    },
    playAttack: (id): void => {
      const record = records.get(id);
      record?.instance?.playOneShot(record.kind === 'enemy' ? 'eat' : 'attack');
    },
    playProduce: (): void => {
      for (const record of records.values()) {
        if (record.kind === 'defender') {
          record.instance?.playOneShot('produce');
        }
      }
    },
    playVictory: (): void => {
      for (const record of records.values()) {
        if (record.kind === 'defender') {
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
          addUnit(defender.id, 'defender', defender.defenderId, x, z, defender.stars);
        }
      }
      for (const enemy of enemies) {
        seen.add(enemy.id);
        const x = simXToWorldX(enemy.x);
        const z = laneToWorldZ(enemy.lane);
        const height = enemyRenderHeight(enemy.enemyId);
        if (objects.has(enemy.id)) {
          objects.moveTo(enemy.id, x, height, z);
        } else {
          addUnit(enemy.id, 'enemy', enemy.enemyId, x, z, 1);
        }
      }
      removeMissing(seen);
    },
    apply: (alpha): void => {
      objects.apply(alpha);
      const now = performance.now();
      const deltaSeconds = (now - lastUpdateMs) / 1000;
      lastUpdateMs = now;
      for (const record of records.values()) {
        record.instance?.update(deltaSeconds);
      }
      for (const [id, endsAt] of flashEndsAt) {
        if (now >= endsAt) {
          clearFlash(id);
        }
      }
    },
    dispose: (): void => {
      disposed = true;
      parent.clear();
      capsuleGeometry.dispose();
      for (const record of records.values()) {
        record.capsuleMaterial?.dispose();
        record.capsuleOutline?.geometry.dispose();
        record.shadow?.geometry.dispose();
        if (record.shadow !== null && !Array.isArray(record.shadow.material)) {
          record.shadow.material.dispose();
        }
        record.instance?.dispose();
      }
      records.clear();
      flashEndsAt.clear();
      models.dispose();
    },
  };
}
