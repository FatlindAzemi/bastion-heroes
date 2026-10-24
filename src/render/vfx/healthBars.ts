/**
 * Health bars of spec 9.7 (issue #75): green over defenders, red over enemies,
 * 0.6 units wide and above the head, shown only after a unit has taken damage.
 * Two instanced meshes (dark backing + coloured fill) keep the whole field at two
 * draw calls; the camera-facing rotation is copied from the level camera each frame.
 */

import {
  Camera,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';

import type { SimState } from '../../sim/types';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { HEALTH_BAR_WIDTH, healthFraction } from './juice';
import { enemyHoverHeight, unitHeadHeight } from './unitHeights';

/** Bar height and the dark backing outline. */
const BAR_HEIGHT = 0.09;
const MAX_BARS = 48;
/** Spec 9.8/9.4: green defenders, red enemies. */
const DEFENDER_COLOR = 0x4cd964;
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const ENEMY_COLOR = 0xff4d4d;
const BACKING_COLOR = 0x1b1b2f;

/** Health bars over units that have taken damage (spec 9.7). */
export interface HealthBars {
  /** Marks a unit id as damaged so its bar starts showing (spec 9.7). */
  markDamaged(id: number): void;
  update(state: Readonly<SimState>, camera: Camera): void;
  dispose(): void;
}

/** Creates the health-bar layer. */
export function createHealthBars(parent: import('three').Group): HealthBars {
  const geometry = new PlaneGeometry(HEALTH_BAR_WIDTH, BAR_HEIGHT);
  const backing = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({ color: BACKING_COLOR, side: DoubleSide }),
    MAX_BARS,
  );
  const fill = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }),
    MAX_BARS,
  );
  backing.frustumCulled = false;
  fill.frustumCulled = false;
  backing.count = 0;
  fill.count = 0;
  const damaged = new Set<number>();
  const scratch = new Color();
  const scratchMatrix = new Matrix4();
  parent.add(backing, fill);

  return {
    markDamaged: (id): void => {
      damaged.add(id);
    },
    update: (state, camera): void => {
      let count = 0;
      const alive = new Set<number>();
      for (const defender of state.defenders) {
        alive.add(defender.id);
        if (!damaged.has(defender.id)) {
          continue;
        }
        const y = unitHeadHeight('defender', defender.defenderId) + 0.12;
        const x = simXToWorldX(defender.col + 0.5);
        const z = laneToWorldZ(defender.lane);
        backing.setMatrixAt(count, barMatrix(scratchMatrix, x, y, z, 1, camera));
        scratch.setHex(BACKING_COLOR);
        backing.setColorAt(count, scratch);
        const fraction = healthFraction(defender.hp, defender.maxHp);
        fill.setMatrixAt(count, barMatrix(scratchMatrix, x, y, z + 0.002, fraction, camera));
        scratch.setHex(DEFENDER_COLOR);
        fill.setColorAt(count, scratch);
        count += 1;
      }
      for (const enemy of state.enemies) {
        alive.add(enemy.id);
        if (!damaged.has(enemy.id)) {
          continue;
        }
        const y = unitHeadHeight('enemy', enemy.enemyId) + enemyHoverHeight(enemy.enemyId) + 0.12;
        const x = simXToWorldX(enemy.x);
        const z = laneToWorldZ(enemy.lane);
        backing.setMatrixAt(count, barMatrix(scratchMatrix, x, y, z, 1, camera));
        scratch.setHex(BACKING_COLOR);
        backing.setColorAt(count, scratch);
        const fraction = healthFraction(enemy.hp, enemy.maxHp);
        fill.setMatrixAt(count, barMatrix(scratchMatrix, x, y, z + 0.002, fraction, camera));
        scratch.setHex(ENEMY_COLOR);
        fill.setColorAt(count, scratch);
        count += 1;
      }
      for (const id of [...damaged]) {
        if (!alive.has(id)) {
          damaged.delete(id);
        }
      }
      backing.count = count;
      fill.count = count;
      if (count > 0) {
        backing.instanceMatrix.needsUpdate = true;
        fill.instanceMatrix.needsUpdate = true;
        if (backing.instanceColor !== null) {
          backing.instanceColor.needsUpdate = true;
        }
        if (fill.instanceColor !== null) {
          fill.instanceColor.needsUpdate = true;
        }
      }
    },
    dispose: (): void => {
      backing.geometry.dispose();
      backing.material.dispose();
      fill.material.dispose();
      backing.removeFromParent();
      fill.removeFromParent();
    },
  };
}

/** Instanced matrix for one bar quad: camera-facing, scaled by the fill fraction. */
function barMatrix(
  matrix: Matrix4,
  x: number,
  y: number,
  z: number,
  fillFraction: number,
  camera: Camera,
): Matrix4 {
  scratchPosition.set(x, y, z);
  scratchScale.set(fillFraction, 1, 1);
  matrix.compose(scratchPosition, camera.quaternion, scratchScale);
  return matrix;
}
