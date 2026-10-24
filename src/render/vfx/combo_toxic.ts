/**
 * Toxic combo (spec 9.7): green cloud expanding plus the "TOXIC!" popup.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'combo_toxic',
  sprite: 3,
  colors: [0x7cff6b, 0x2e7d32, 0x7c4dff],
  count: 18,
  speed: 1.6,
  upward: 0.8,
  gravity: -0.2,
  lifeMin: 0.6,
  lifeMax: 1.0,
  size: 0.26,
};
