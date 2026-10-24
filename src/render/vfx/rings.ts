/**
 * Expanding ring of the spec 9.7 `hit_blast` VFX: an orange ring that grows and
 * fades at the impact point, on top of the smoke particles. All live rings share one
 * instanced mesh (one draw call) and one flat ring geometry.
 */

import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';

const MAX_RINGS = 8;
const RING_LIFE_S = 0.3;
const RING_COLOR = 0xff8a2b;

/** Expanding blast rings (spec 9.7). */
export interface BlastRings {
  spawn(x: number, y: number, z: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** One live ring. */
interface RingEntry {
  x: number;
  y: number;
  z: number;
  age: number;
}

/** Creates the blast ring layer. */
export function createBlastRings(parent: import('three').Group): BlastRings {
  const geometry = new RingGeometry(0.16, 0.24, 16);
  const material = new MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: 2,
  });
  const mesh = new InstancedMesh(geometry, material, MAX_RINGS);
  parent.add(mesh);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const entries: RingEntry[] = [];
  const matrix = new Matrix4();
  const rotation = new Euler(-Math.PI / 2, 0, 0);
  const rotationQuaternion = new Quaternion().setFromEuler(rotation);
  const scratchPosition = new Vector3();
  const scratchScale = new Vector3();
  const scratchColor = new Color(RING_COLOR);

  return {
    spawn: (x, y, z): void => {
      if (entries.length >= MAX_RINGS) {
        entries.shift();
      }
      entries.push({ x, y, z, age: 0 });
    },
    update: (deltaSeconds): void => {
      let count = 0;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= RING_LIFE_S) {
          entries.splice(index, 1);
          continue;
        }
        const progress = entry.age / RING_LIFE_S;
        const scale = 1 + progress * 3.2;
        scratchPosition.set(entry.x, entry.y, entry.z);
        scratchScale.set(scale, scale, scale);
        matrix.compose(scratchPosition, rotationQuaternion, scratchScale);
        mesh.setMatrixAt(count, matrix);
        mesh.setColorAt(count, scratchColor);
        count += 1;
      }
      mesh.count = count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
