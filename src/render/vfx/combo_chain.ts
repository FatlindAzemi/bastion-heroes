/**
 * Chain combo (spec 9.7): lightning arcs (chainArcs.ts) plus the "CHAIN!" popup.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'combo_chain',
  sprite: 2,
  colors: [0x3cf2ff, 0xf4fbff, 0x7cff6b],
  count: 8,
  speed: 2.6,
  upward: 1.2,
  gravity: 3.0,
  lifeMin: 0.25,
  lifeMax: 0.45,
  size: 0.16,
};
