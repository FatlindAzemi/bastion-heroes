import { CapsuleGeometry, Group, Mesh, MeshToonMaterial } from 'three';

import { rules } from '../data/rules';
import type { DefenderState, EnemyState } from '../sim/types';
import { defenderColor, enemyColor } from './greyboxPalette';
import { createToonMaterial } from './toonMaterial';
import { InterpolatedObjects } from './viewMap';
import { columnToWorldX, laneToWorldZ, simXToWorldX } from './worldMapping';

/** Capsule size: about 0.9 tiles tall and inside one tile (spec 9.3). */
const CAPSULE_RADIUS = 0.28 * rules.grid.tileSize;
const CAPSULE_LENGTH = 0.34 * rules.grid.tileSize;
const CAPSULE_CENTER_Y = CAPSULE_RADIUS + CAPSULE_LENGTH / 2;

/** Model scale per star level (spec 3.6, values from `rules.merge`). */
const STAR_SCALES: Readonly<Record<1 | 2 | 3, number>> = {
  1: 1,
  2: rules.merge.star2Scale,
  3: rules.merge.star3Scale,
};

/** Greybox capsules for defenders and enemies, driven by the sim events (spec 11.7). */
export interface UnitLayer {
  spawnDefender(id: number, defenderId: string, lane: number, col: number, stars: 1 | 2 | 3): void;
  spawnEnemy(id: number, enemyId: string, lane: number, x: number): void;
  setStars(id: number, stars: 1 | 2 | 3): void;
  remove(id: number): void;
  sync(defenders: readonly DefenderState[], enemies: readonly EnemyState[]): void;
  apply(alpha: number): void;
  dispose(): void;
}

/** Creates the capsule layer; the layer owns its group and cleans it up in `dispose`. */
export function createUnitLayer(parent: Group): UnitLayer {
  const geometry = new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 4, 12);
  geometry.translate(0, CAPSULE_CENTER_Y, 0);
  const objects = new InterpolatedObjects();
  const materials = new Map<number, MeshToonMaterial>();

  /** Returns the shared toon material of a body colour. */
  function materialFor(color: number): MeshToonMaterial {
    const existing = materials.get(color);
    if (existing !== undefined) {
      return existing;
    }
    const material = createToonMaterial(color);
    materials.set(color, material);
    return material;
  }

  /** Creates the capsule of an entity at its first position, if it does not exist yet. */
  function addUnit(id: number, color: number, x: number, z: number, stars: 1 | 2 | 3): void {
    if (objects.has(id)) {
      return;
    }
    const mesh = new Mesh(geometry, materialFor(color));
    mesh.scale.setScalar(STAR_SCALES[stars]);
    parent.add(mesh);
    objects.add(id, mesh, x, 0, z);
  }

  /** Detaches and forgets one capsule. */
  function removeUnit(id: number): void {
    const object = objects.remove(id);
    if (object !== null) {
      parent.remove(object);
    }
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
      objects.objectOf(id)?.scale.setScalar(STAR_SCALES[stars]);
    },
    remove: removeUnit,
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
    },
    dispose: (): void => {
      parent.clear();
      geometry.dispose();
      for (const material of materials.values()) {
        material.dispose();
      }
    },
  };
}
