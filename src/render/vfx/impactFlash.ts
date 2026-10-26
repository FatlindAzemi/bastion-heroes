/**
 * White impact flash of the 2.5D relaunch (issue #114 §3): every hit adds a short
 * additive glow pop at the impact point (a white core plus a coloured halo per
 * damage type) on top of the spec 9.2 unit flash, so hits read instantly and the
 * bloom pass catches them. One shared billboard batch keeps the layer at one draw
 * call; the flash only lives 0.18 s.
 */

import type { Texture } from 'three';

import { ADDITIVE_BLENDING, createBillboardBatch, type BillboardBatch } from './billboardBatch';
import { IMPACT_FLASH_LIFE_S, impactFlashAlpha, impactFlashScale } from './juice';

/** Maximum simultaneous flashes; a busy wave fires less than one per frame. */
const MAX_FLASHES = 20;
/** Soft-circle atlas cell of the shared particle sheet. */
const GLOW_CELL = 0;
/** World size of the core and halo quads at full flash. */
const CORE_SIZE = 0.62;
const HALO_SIZE = 1.05;
/** HDR tints so bloom picks the flash up over the bright ground. */
const CORE_INTENSITY = 1.6;
const HALO_INTENSITY = 1.1;

/** One pooled flash: white core plus a damage-type coloured halo. */
interface FlashEntry {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  color: number;
  scale: number;
}

/** Short additive impact flashes (issue #114 §3). */
export interface ImpactFlash {
  spawn(x: number, y: number, z: number, color: number, scale: number): void;
  update(deltaSeconds: number): void;
  setTexture(texture: Texture): void;
  dispose(): void;
}

/** Creates the impact-flash layer. */
export function createImpactFlash(parent: import('three').Group): ImpactFlash {
  const batch: BillboardBatch = createBillboardBatch(MAX_FLASHES * 2, 4, 2, null, {
    blending: ADDITIVE_BLENDING,
    depthTest: false,
    renderOrder: 940,
  });
  parent.add(batch.mesh);
  const entries: FlashEntry[] = [];
  for (let index = 0; index < MAX_FLASHES; index += 1) {
    entries.push({ active: false, x: 0, y: 0, z: 0, age: 0, color: 0xffffff, scale: 1 });
  }
  let cursor = 0;

  /** Returns the next pooled entry, recycling the oldest when the cap is reached. */
  function acquireEntry(): FlashEntry {
    for (const entry of entries) {
      if (!entry.active) {
        return entry;
      }
    }
    const entry = entries[cursor] ?? entries[0];
    cursor = (cursor + 1) % entries.length;
    return entry ?? { active: true, x: 0, y: 0, z: 0, age: 0, color: 0xffffff, scale: 1 };
  }

  return {
    spawn: (x, y, z, color, scale): void => {
      const entry = acquireEntry();
      if (entry === undefined) {
        return;
      }
      entry.active = true;
      entry.x = x;
      entry.y = y;
      entry.z = z;
      entry.age = 0;
      entry.color = color;
      entry.scale = scale;
    },
    update: (deltaSeconds): void => {
      batch.begin();
      for (const entry of entries) {
        if (!entry.active) {
          continue;
        }
        entry.age += deltaSeconds;
        if (entry.age >= IMPACT_FLASH_LIFE_S) {
          entry.active = false;
          continue;
        }
        const progress = entry.age / IMPACT_FLASH_LIFE_S;
        const alpha = impactFlashAlpha(progress);
        const size = entry.scale * impactFlashScale(progress);
        batch.add({
          x: entry.x,
          y: entry.y,
          z: entry.z,
          width: CORE_SIZE * size,
          height: CORE_SIZE * size,
          cell: GLOW_CELL,
          color: 0xffffff,
          alpha,
          intensity: CORE_INTENSITY,
        });
        batch.add({
          x: entry.x,
          y: entry.y,
          z: entry.z,
          width: HALO_SIZE * size,
          height: HALO_SIZE * size,
          cell: GLOW_CELL,
          color: entry.color,
          alpha: alpha * 0.8,
          intensity: HALO_INTENSITY,
        });
      }
      batch.end();
    },
    setTexture: (texture): void => {
      batch.setTexture(texture);
    },
    dispose: (): void => {
      batch.dispose();
    },
  };
}
