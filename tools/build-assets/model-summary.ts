/**
 * Reads the facts the asset checker needs out of a committed `.glb` (spec 12.7).
 *
 * The optimized models use `KHR_mesh_quantization` and `EXT_meshopt_compression`,
 * so vertex positions are stored as normalized integers and the bind-pose scale
 * lives in the skin's inverse bind matrices. Measuring the model therefore means
 * decoding the buffers (glTF Transform does that) and evaluating the skinning
 * equation at the bind pose:
 *
 *     world(vertex) = sum(weight_j * jointWorld_j * inverseBind_j * position)
 *
 * The same file also yields the clip names, joint names and triangle count used
 * by `check.ts` (spec 9.3, 12.5, 12.6).
 */

import { MathUtils, NodeIO } from '@gltf-transform/core';
import type { Accessor, Node, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getGLPrimitiveCount } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

import type { ModelBounds, ModelSummary } from './check-logic';

type Vector3 = [number, number, number];

let sharedIo: NodeIO | null = null;

/** The shared glTF reader, with the extensions and meshopt codecs registered. */
async function modelIo(): Promise<NodeIO> {
  if (sharedIo !== null) {
    return sharedIo;
  }
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  sharedIo = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  return sharedIo;
}

/** Reads one float per array slot; strict mode makes missing slots impossible. */
function numberAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`missing array value at index ${index}`);
  }
  return value;
}

/** Column-major 4x4 matrix product, as used by glTF (row = column * 4 + row). */
function multiplyMatrices(left: ArrayLike<number>, right: ArrayLike<number>): number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += numberAt(left, k * 4 + row) * numberAt(right, column * 4 + k);
      }
      result[column * 4 + row] = sum;
    }
  }
  return result;
}

/** Applies a column-major 4x4 matrix to a point (w = 1). */
function transformPoint(matrix: ArrayLike<number>, point: Vector3): Vector3 {
  return [
    numberAt(matrix, 0) * point[0] +
      numberAt(matrix, 4) * point[1] +
      numberAt(matrix, 8) * point[2] +
      numberAt(matrix, 12),
    numberAt(matrix, 1) * point[0] +
      numberAt(matrix, 5) * point[1] +
      numberAt(matrix, 9) * point[2] +
      numberAt(matrix, 13),
    numberAt(matrix, 2) * point[0] +
      numberAt(matrix, 6) * point[1] +
      numberAt(matrix, 10) * point[2] +
      numberAt(matrix, 14),
  ];
}

/** Reads an accessor into floats, undoing integer normalization when needed. */
function readAccessorFloats(accessor: Accessor, size: number): Float64Array {
  const array = accessor.getArray();
  if (array === null) {
    throw new Error(`accessor "${accessor.getName()}" has no data`);
  }
  const normalized = accessor.getNormalized();
  const componentType = accessor.getComponentType();
  const values = new Float64Array(accessor.getCount() * size);
  for (let index = 0; index < values.length; index += 1) {
    const value = numberAt(array, index);
    values[index] = normalized ? MathUtils.decodeNormalizedInt(value, componentType) : value;
  }
  return values;
}

/** World-space matrix of every joint at the rest pose. */
function skinMatrices(node: Node): number[][] | null {
  const skin = node.getSkin();
  if (skin === null) {
    return null;
  }
  const inverseBindAccessor = skin.getInverseBindMatrices();
  if (inverseBindAccessor === null) {
    throw new Error('skin has no inverse bind matrices');
  }
  const inverseBind = readAccessorFloats(inverseBindAccessor, 16);
  return skin.listJoints().map((joint, index) => {
    const offset = index * 16;
    return multiplyMatrices(
      joint.getWorldMatrix(),
      Array.from(inverseBind.subarray(offset, offset + 16)),
    );
  });
}

/** Accumulates the bounding box in scalar fields, then freezes it once. */
interface MutableBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function emptyBounds(): MutableBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function includePoint(bounds: MutableBounds, point: Vector3): void {
  bounds.minX = Math.min(bounds.minX, point[0]);
  bounds.minY = Math.min(bounds.minY, point[1]);
  bounds.minZ = Math.min(bounds.minZ, point[2]);
  bounds.maxX = Math.max(bounds.maxX, point[0]);
  bounds.maxY = Math.max(bounds.maxY, point[1]);
  bounds.maxZ = Math.max(bounds.maxZ, point[2]);
}

function toBounds(bounds: MutableBounds): ModelBounds {
  return {
    min: [bounds.minX, bounds.minY, bounds.minZ],
    max: [bounds.maxX, bounds.maxY, bounds.maxZ],
  };
}

/** Adds the skinned bind-pose positions of one primitive to `bounds`. */
function includeSkinnedPrimitive(
  primitive: Primitive,
  matrices: number[][],
  bounds: MutableBounds,
): void {
  const position = primitive.getAttribute('POSITION');
  const joints = primitive.getAttribute('JOINTS_0');
  const weights = primitive.getAttribute('WEIGHTS_0');
  if (position === null || joints === null || weights === null) {
    throw new Error('skinned model needs POSITION, JOINTS_0 and WEIGHTS_0');
  }
  const positions = readAccessorFloats(position, 3);
  const jointIndices = readAccessorFloats(joints, 4);
  const jointWeights = readAccessorFloats(weights, 4);
  for (let vertex = 0; vertex < position.getCount(); vertex += 1) {
    const point: Vector3 = [
      numberAt(positions, vertex * 3),
      numberAt(positions, vertex * 3 + 1),
      numberAt(positions, vertex * 3 + 2),
    ];
    let worldX = 0;
    let worldY = 0;
    let worldZ = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      const weight = numberAt(jointWeights, vertex * 4 + influence);
      if (weight === 0) {
        continue;
      }
      const matrix = matrices[Math.round(numberAt(jointIndices, vertex * 4 + influence))];
      if (matrix === undefined) {
        throw new Error('skinned vertex references a missing joint');
      }
      const transformed = transformPoint(matrix, point);
      worldX += transformed[0] * weight;
      worldY += transformed[1] * weight;
      worldZ += transformed[2] * weight;
    }
    includePoint(bounds, [worldX, worldY, worldZ]);
  }
}

/** Adds the unskinned positions of one primitive (transformed by its node). */
function includeStaticPrimitive(
  primitive: Primitive,
  worldMatrix: ArrayLike<number>,
  bounds: MutableBounds,
): void {
  const position = primitive.getAttribute('POSITION');
  if (position === null) {
    return;
  }
  const positions = readAccessorFloats(position, 3);
  for (let vertex = 0; vertex < position.getCount(); vertex += 1) {
    const point: Vector3 = [
      numberAt(positions, vertex * 3),
      numberAt(positions, vertex * 3 + 1),
      numberAt(positions, vertex * 3 + 2),
    ];
    includePoint(bounds, transformPoint(worldMatrix, point));
  }
}

/** Triangle count of a whole document (spec 9.3 budgets). */
function countTriangles(nodes: readonly Node[]): number {
  let total = 0;
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (mesh === null) {
      continue;
    }
    for (const primitive of mesh.listPrimitives()) {
      total += getGLPrimitiveCount(primitive);
    }
  }
  return total;
}

/** Reads one committed model into the summary `check.ts` validates. */
export async function readModelSummary(path: string): Promise<ModelSummary> {
  const document = await (await modelIo()).read(path);
  const root = document.getRoot();
  const meshNodes = root.listNodes().filter((node) => node.getMesh() !== null);
  if (meshNodes.length === 0) {
    throw new Error('the model has no mesh');
  }
  const bounds = emptyBounds();
  const joints = new Set<string>();
  for (const node of meshNodes) {
    const mesh = node.getMesh();
    if (mesh === null) {
      continue;
    }
    const skin = skinMatrices(node);
    if (skin !== null) {
      for (const joint of node.getSkin()?.listJoints() ?? []) {
        joints.add(joint.getName());
      }
    }
    for (const primitive of mesh.listPrimitives()) {
      if (skin !== null) {
        includeSkinnedPrimitive(primitive, skin, bounds);
      } else {
        includeStaticPrimitive(primitive, node.getWorldMatrix(), bounds);
      }
    }
  }
  if (!Number.isFinite(bounds.minY)) {
    throw new Error('the model has no vertices to measure');
  }
  return {
    bytes: statSync(path).size,
    animations: root.listAnimations().map((animation) => animation.getName()),
    joints: [...joints],
    triangles: countTriangles(meshNodes),
    bounds: toBounds(bounds),
  };
}
