import { CapsuleGeometry, Group, Mesh, MeshToonMaterial } from 'three';

import { rules } from '../data/rules';
import { starModelScale } from '../sim/stars';
import type { DefenderState, EnemyState } from '../sim/types';
import { createBlobShadow } from './blobShadow';
import { defenderColor, enemyColor } from './greyboxPalette';
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

/** Hit flash duration of spec 9.2 (0.08 s). */
const HIT_FLASH_MS = 80;

/** White flash colour mixed into the material emissive channel for 0.08 s (spec 9.2). */
const HIT_FLASH_COLOR = 0xffffff;

/** Unit capsules for defenders and enemies, driven by the sim events (spec 11.7). */
export interface UnitLayer {
  spawnDefender(id: number, defenderId: string, lane: number, col: number, stars: 1 | 2 | 3): void;
  spawnEnemy(id: number, enemyId: string, lane: number, x: number): void;
  setStars(id: number, stars: 1 | 2 | 3): void;
  remove(id: number): void;
  /** Flashes one unit white for 0.08 s (spec 9.2 hit flash). */
  flash(id: number): void;
  sync(defenders: readonly DefenderState[], enemies: readonly EnemyState[]): void;
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the capsule layer; the layer owns its group and cleans it up in `dispose`. */
export function createUnitLayer(parent: Group): UnitLayer {
  const geometry = new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 4, 12);
  geometry.translate(0, CAPSULE_CENTER_Y, 0);
  const objects = new InterpolatedObjects();
  // One material per unit: the hit flash must only light up the unit that got hit (spec 9.2).
  const materials = new Map<number, MeshToonMaterial>();
  const flashEndsAt = new Map<number, number>();

  /** Creates the capsule, outline and blob shadow of an entity at its first position. */
  function addUnit(id: number, color: number, x: number, z: number, stars: 1 | 2 | 3): void {
    if (objects.has(id)) {
      return;
    }
    const material = createToonMaterial(color);
    const mesh = new Mesh(geometry, material);
    // The model scale of a star level comes from the sim helper (spec 3.6).
    mesh.scale.setScalar(starModelScale(stars));
    // Spec 9.2: inverted-hull outline on every character mesh plus a blob shadow on the ground.
    addOutline(mesh);
    mesh.add(createBlobShadow(BLOB_SHADOW_WIDTH, BLOB_SHADOW_WIDTH));
    parent.add(mesh);
    objects.add(id, mesh, x, 0, z);
    materials.set(id, material);
  }

  /** Resets the flash of one unit and forgets it. */
  function clearFlash(id: number): void {
    const material = materials.get(id);
    if (material !== undefined) {
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
    flashEndsAt.delete(id);
  }

  /** Detaches and forgets one capsule. */
  function removeUnit(id: number): void {
    const object = objects.remove(id);
    if (object !== null) {
      parent.remove(object);
    }
    clearFlash(id);
    materials.get(id)?.dispose();
    materials.delete(id);
  }

  /** Removes capsules whose sim entity disappeared without a removal event (spec 11.7 safety). */
  function removeMissing(seen: ReadonlySet<number>): void {
    for (const id of [...objects.ids()]) {
      if (!seen.has(id)) {
        removeUnit(id);
      }
    }
  }

  return {
    spawnDefender: (id, defenderId, lane, col, stars): void => {
      addUnit(id, defenderColor(defenderId), columnToWorldX(col), laneToWorldZ(lane), stars);
    },
    spawnEnemy: (id, enemyId, lane, x): void => {
      addUnit(id, enemyColor(enemyId), simXToWorldX(x), laneToWorldZ(lane), 1);
    },
    setStars: (id, stars): void => {
      objects.objectOf(id)?.scale.setScalar(starModelScale(stars));
    },
    remove: removeUnit,
    flash: (id): void => {
      const material = materials.get(id);
      if (material === undefined) {
        return;
      }
      material.emissive.setHex(HIT_FLASH_COLOR);
      material.emissiveIntensity = 1;
      flashEndsAt.set(id, performance.now() + HIT_FLASH_MS);
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
          addUnit(defender.id, defenderColor(defender.defenderId), x, z, defender.stars);
        }
      }
      for (const enemy of enemies) {
        seen.add(enemy.id);
        const x = simXToWorldX(enemy.x);
        const z = laneToWorldZ(enemy.lane);
        if (objects.has(enemy.id)) {
          objects.moveTo(enemy.id, x, 0, z);
        } else {
          addUnit(enemy.id, enemyColor(enemy.enemyId), x, z, 1);
        }
      }
      removeMissing(seen);
    },
    apply: (alpha): void => {
      objects.apply(alpha);
      const now = performance.now();
      for (const [id, endsAt] of flashEndsAt) {
        if (now >= endsAt) {
          clearFlash(id);
        }
      }
    },
    dispose: (): void => {
      parent.clear();
      geometry.dispose();
      flashEndsAt.clear();
      for (const material of materials.values()) {
        material.dispose();
      }
      materials.clear();
    },
  };
}
