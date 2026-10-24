/**
 * Allocation-free matrix position write for the instanced VFX meshes: three's
 * `Matrix4.setPosition` only accepts a Vector3 in the pinned three typings, and the
 * per-frame effect loops must not allocate (spec 11.4).
 */

import type { Matrix4 } from 'three';

/** Writes the translation column of a matrix without creating a Vector3. */
export function setMatrixPosition(matrix: Matrix4, x: number, y: number, z: number): void {
  matrix.elements[12] = x;
  matrix.elements[13] = y;
  matrix.elements[14] = z;
}
