/**
 * Blast hit (spec 9.7): orange smoke burst plus the expanding ring of `rings.ts`.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'hit_blast',
  sprite: 3,
  colors: [0xff8a2b, 0xf4e3c3, 0x8a9ba8],
  count: 12,
  speed: 1.6,
  upward: 0.9,
  gravity: 3.5,
  lifeMin: 0.35,
  lifeMax: 0.6,
  size: 0.22,
};
