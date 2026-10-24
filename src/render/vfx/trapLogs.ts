/**
 * Rolling log of the spec 9.7 `trap_roll` VFX: when a trap fires, a wooden log rolls
 * down its lane from the base side, leaving dust and leaves (particles from
 * `trap_roll.ts`). A small instanced mesh (one draw call) covers every rolling log.
 */

import {
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Vector3,
} from 'three';

import { rules } from '../../data/rules';
import { laneToWorldZ } from '../worldMapping';
import { getToonGradientMap } from '../toonMaterial';
import { setMatrixPosition } from './matrix';

const MAX_LOGS = 3;
const LOG_LENGTH_S = 1.3;
const LOG_START_X = -0.4;
const LOG_END_X = 10;
const LOG_RADIUS = 0.16;
const LOG_LENGTH = 0.55;
const LOG_COLOR = 0x6f4526;

/** One rolling log. */
interface LogEntry {
  lane: number;
  age: number;
}

/** Rolling trap logs (spec 9.7). */
export interface TrapLogs {
  spawn(lane: number): void;
  /** Advances the logs; returns the world positions that should emit dust this frame. */
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** Creates the trap log layer. */
export function createTrapLogs(parent: import('three').Group): TrapLogs {
  const geometry = new CylinderGeometry(LOG_RADIUS, LOG_RADIUS, LOG_LENGTH, 8);
  // Lie the cylinder across the lane: its axis points along z, rolling around z.
  const material = new MeshToonMaterial({ color: LOG_COLOR, gradientMap: getToonGradientMap() });
  const mesh = new InstancedMesh(geometry, material, MAX_LOGS);
  parent.add(mesh);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const entries: LogEntry[] = [];
  const matrix = new Matrix4();
  const baseRotation = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));
  const worldRotation = new Quaternion();
  const zAxis = new Quaternion();
  const rollAxis = new Vector3(0, 0, 1);

  return {
    spawn: (lane): void => {
      if (entries.length >= MAX_LOGS) {
        entries.shift();
      }
      entries.push({ lane, age: 0 });
    },
    update: (deltaSeconds): void => {
      let count = 0;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= LOG_LENGTH_S) {
          entries.splice(index, 1);
          continue;
        }
        const progress = entry.age / LOG_LENGTH_S;
        const distance = LOG_START_X + (LOG_END_X - LOG_START_X) * progress;
        const roll = (distance - LOG_START_X) / LOG_RADIUS;
        zAxis.setFromAxisAngle(rollAxis, roll);
        worldRotation.copy(zAxis).multiply(baseRotation);
        matrix.makeRotationFromQuaternion(worldRotation);
        setMatrixPosition(
          matrix,
          distance * rules.grid.tileSize,
          rules.grid.tileSize * 0.17,
          laneToWorldZ(entry.lane),
        );
        mesh.setMatrixAt(count, matrix);
        count += 1;
      }
      mesh.count = count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
