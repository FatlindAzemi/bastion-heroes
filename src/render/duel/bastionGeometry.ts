/**
 * Geometry helpers for the second bastion of the Duel (spec 18.1, issue #129). The
 * World 1 structures mesh holds the south bastion and the campaign portal arch in
 * one quantized mesh. The Duel keeps only the bastion half and places a copy of it,
 * turned half around the board centre, at the north end. Final gate models are D2.3.
 */
import { BufferAttribute, BufferGeometry, Matrix4, type Mesh } from 'three';

import { duelRules, rules } from '../../data';

/** World x of the board centre: the middle of the midline column (spec 18.1). */
export const BOARD_CENTER_X =
  ((duelRules.board.southBaseLineX + duelRules.board.northBaseLineX) / 2) * rules.grid.tileSize;
/** World z of the board centre: the middle lane (spec 9.1). */
export const BOARD_CENTER_Z = (rules.grid.laneCount / 2) * rules.grid.tileSize;

/**
 * Copies a (possibly quantized and indexed) mesh geometry into plain float triangles
 * in world space, so it can be cut and transformed freely.
 */
export function worldFloatGeometry(mesh: Mesh): BufferGeometry {
  const source = mesh.geometry.index === null ? mesh.geometry : mesh.geometry.toNonIndexed();
  const result = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let index = 0; index < attribute.count; index += 1) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        values[index * attribute.itemSize + component] = attribute.getComponent(index, component);
      }
    }
    result.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
  }
  mesh.updateWorldMatrix(true, false);
  result.applyMatrix4(mesh.matrixWorld);
  return result;
}

/** Keeps the triangles whose centroid x is below `maxX`; the geometry must be non-indexed. */
export function keepTrianglesBelowX(geometry: BufferGeometry, maxX: number): BufferGeometry {
  const position = geometry.getAttribute('position');
  const kept: number[] = [];
  for (let vertex = 0; vertex + 2 < position.count; vertex += 3) {
    const centroidX =
      (position.getX(vertex) + position.getX(vertex + 1) + position.getX(vertex + 2)) / 3;
    if (centroidX < maxX) {
      kept.push(vertex, vertex + 1, vertex + 2);
    }
  }
  const result = new BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = new Float32Array(kept.length * attribute.itemSize);
    kept.forEach((vertex, target) => {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        values[target * attribute.itemSize + component] = attribute.getComponent(vertex, component);
      }
    });
    result.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
  }
  return result;
}

/**
 * The half turn around the board centre: (x, z) becomes (9 - x, 5 - z), exactly the
 * spec 18.1 mirror (x to 9 - x, lane to 4 - lane), so the north bastion stands where
 * the south one would stand in the north player's view.
 */
export function halfTurnMatrix(): Matrix4 {
  return new Matrix4()
    .makeTranslation(BOARD_CENTER_X, 0, BOARD_CENTER_Z)
    .multiply(new Matrix4().makeRotationY(Math.PI))
    .multiply(new Matrix4().makeTranslation(-BOARD_CENTER_X, 0, -BOARD_CENTER_Z));
}
