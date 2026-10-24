/**
 * Essence orb glow of the spec 9.7 `essence_orb` VFX: a soft teal glow billboard
 * under every orb plus a slow sparkle trail (particles fired by the VFX layer).
 * The glow reuses the shared particle sheet, so it adds one draw call without a
 * second texture.
 */

import { Texture } from 'three';

import type { OrbState } from '../../sim/types';
import { laneToWorldZ, simXToWorldX } from '../worldMapping';
import { createBillboardBatch, type BillboardBatch } from './billboardBatch';

const MAX_ORBS = 16;
/** Soft circle cell of the shared particle sheet. */
const GLOW_CELL = 0;
const GLOW_COLOR = 0x3bf0c8;
const BASE_SIZE = 0.9;

/** The teal Essence orb glow (spec 9.7). */
export interface OrbGlow {
  setTexture(texture: Texture): void;
  update(orbs: readonly OrbState[], height: number, elapsedSeconds: number): void;
  dispose(): void;
}

/** Creates the orb glow layer. */
export function createOrbGlow(parent: import('three').Group): OrbGlow {
  const batch: BillboardBatch = createBillboardBatch(MAX_ORBS, 4, 2, null);
  parent.add(batch.mesh);
  return {
    setTexture: (texture): void => {
      batch.setTexture(texture);
    },
    update: (orbs, height, elapsedSeconds): void => {
      batch.begin();
      for (const orb of orbs) {
        const pulse = 1 + Math.sin(elapsedSeconds * 3 + orb.id) * 0.08;
        batch.add({
          x: simXToWorldX(orb.x),
          y: height,
          z: laneToWorldZ(orb.lane),
          width: BASE_SIZE * pulse,
          height: BASE_SIZE * pulse,
          cell: GLOW_CELL,
          color: GLOW_COLOR,
          alpha: 0.35,
        });
      }
      batch.end();
    },
    dispose: (): void => {
      batch.dispose();
    },
  };
}
