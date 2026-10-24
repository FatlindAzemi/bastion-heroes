/**
 * Lightning arcs of the spec 9.7 `combo_chain` VFX: cyan jagged lines that flash
 * between the combo point and the nearest enemies, then fade out. All arcs share one
 * `LineSegments` buffer (one draw call), rebuilt when a combo fires.
 */

import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';

const MAX_SEGMENTS = 64;
const ARC_LIFE_S = 0.35;
const ARC_COLOR = 0x3cf2ff;

/** One arc: start/end points and its age. */
interface ArcEntry {
  readonly points: readonly number[];
  age: number;
}

/** Lightning arcs between enemies (spec 9.7). */
export interface ChainArcs {
  /** Fires an arc from `from` to every `to` point (already in world coordinates). */
  spawn(
    from: readonly [number, number, number],
    to: readonly (readonly [number, number, number])[],
  ): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

/** Creates the chain arc layer. */
export function createChainArcs(parent: import('three').Group): ChainArcs {
  const positions = new Float32Array(MAX_SEGMENTS * 2 * 3);
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);
  const material = new LineBasicMaterial({
    color: ARC_COLOR,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const lines = new LineSegments(geometry, material);
  parent.add(lines);
  lines.frustumCulled = false;
  lines.visible = false;
  const entries: ArcEntry[] = [];
  let randomState = 0x51ed270b;

  const random = (): number => {
    randomState = (randomState + 0x9e3779b9) >>> 0;
    let value = randomState;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
  };

  return {
    spawn: (from, to): void => {
      let segmentCursor = 0;
      for (const target of to) {
        if (segmentCursor + 6 > MAX_SEGMENTS || entries.length + 6 > MAX_SEGMENTS) {
          break;
        }
        let previousX = from[0];
        let previousY = from[1];
        let previousZ = from[2];
        for (let step = 1; step <= 6; step += 1) {
          const t = step / 6;
          const jitter = step === 6 ? 0 : 0.12;
          const x = from[0] + (target[0] - from[0]) * t + (random() - 0.5) * jitter;
          const y = from[1] + (target[1] - from[1]) * t + (random() - 0.5) * jitter;
          const z = from[2] + (target[2] - from[2]) * t + (random() - 0.5) * jitter;
          entries.push({ points: [previousX, previousY, previousZ, x, y, z], age: 0 });
          previousX = x;
          previousY = y;
          previousZ = z;
          segmentCursor += 1;
        }
      }
    },
    update: (deltaSeconds): void => {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= ARC_LIFE_S) {
          entries.splice(index, 1);
        }
      }
      let offset = 0;
      for (const entry of entries) {
        for (const value of entry.points) {
          positions[offset] = value;
          offset += 1;
        }
      }
      attribute.needsUpdate = true;
      material.opacity =
        entries.length > 0 ? Math.max(0, 1 - (entries[0]?.age ?? 0) / ARC_LIFE_S) * 0.9 : 0.9;
      lines.visible = entries.length > 0;
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      lines.removeFromParent();
    },
  };
}
