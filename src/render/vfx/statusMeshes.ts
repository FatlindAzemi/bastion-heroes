/**
 * Status-effect meshes of spec 9.7 (issue #75): the translucent ice block of
 * `status_freeze` and the blue tint shell of `status_slow` are simple procedural
 * meshes around the affected enemy (no alpha-sorted sprites needed). Each status is
 * one instanced mesh, so the whole field costs two draw calls.
 */

import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

import type { EnemyState, SimState } from '../../sim/types';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { enemyHoverHeight } from './unitHeights';
import { setMatrixPosition } from './matrix';

const MAX_STATUS_MESHES = 16;
const ICE_COLOR = 0x9be7ff;
const TINT_COLOR = 0x3fa9f5;
/** Ice block dimensions around a standard enemy; the Ogre gets a taller block. */
const ICE_WIDTH = 0.9;
const ICE_HEIGHT = 1.05;
const ICE_DEPTH = 0.9;

/** Ice blocks and slow tints of spec 9.7. */
export interface StatusMeshes {
  update(state: Readonly<SimState>): void;
  dispose(): void;
}

/** Creates the status mesh layer. */
export function createStatusMeshes(parent: import('three').Group): StatusMeshes {
  const iceGeometry = new BoxGeometry(ICE_WIDTH, ICE_HEIGHT, ICE_DEPTH);
  const ice = new InstancedMesh(
    iceGeometry,
    new MeshBasicMaterial({
      color: ICE_COLOR,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
    MAX_STATUS_MESHES,
  );
  const tintGeometry = new SphereGeometry(0.5, 10, 7);
  const tint = new InstancedMesh(
    tintGeometry,
    new MeshBasicMaterial({
      color: TINT_COLOR,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
    MAX_STATUS_MESHES,
  );
  ice.frustumCulled = false;
  tint.frustumCulled = false;
  ice.count = 0;
  tint.count = 0;
  const matrix = new Matrix4();
  const scratchPosition = new Matrix4();
  const scratchVector = new Vector3();
  const scratchScale = new Vector3();
  const identityQuaternion = new Quaternion();
  parent.add(ice, tint);

  /** True when the enemy carries the given status id. */
  function hasStatus(enemy: EnemyState, kind: 'freeze' | 'slow'): boolean {
    return enemy.statuses.some((status) => status.kind === kind);
  }

  return {
    update: (state): void => {
      let iceCount = 0;
      let tintCount = 0;
      for (const enemy of state.enemies) {
        const x = simXToWorldX(enemy.x);
        const z = laneToWorldZ(enemy.lane);
        const hover = enemyHoverHeight(enemy.enemyId);
        if (hasStatus(enemy, 'freeze') && iceCount < MAX_STATUS_MESHES) {
          const iceScale = enemy.enemyId === 'gloom_ogre' ? 1.35 : 1;
          scratchVector.set(x, hover + (ICE_HEIGHT * iceScale) / 2, z);
          scratchScale.set(1, iceScale, 1);
          matrix.compose(scratchVector, identityQuaternion, scratchScale);
          ice.setMatrixAt(iceCount, matrix);
          iceCount += 1;
        }
        if (hasStatus(enemy, 'slow') && tintCount < MAX_STATUS_MESHES) {
          scratchPosition.identity();
          setMatrixPosition(scratchPosition, x, hover + 0.55, z);
          tint.setMatrixAt(tintCount, scratchPosition);
          tintCount += 1;
        }
      }
      ice.count = iceCount;
      tint.count = tintCount;
      if (iceCount > 0) {
        ice.instanceMatrix.needsUpdate = true;
      }
      if (tintCount > 0) {
        tint.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: (): void => {
      iceGeometry.dispose();
      tintGeometry.dispose();
      ice.material.dispose();
      tint.material.dispose();
      ice.removeFromParent();
      tint.removeFromParent();
    },
  };
}
