/**
 * Merge burst (spec 9.6/9.7): gold star explosion when two defenders merge.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'merge_star',
  sprite: 1,
  colors: [0xffd54a, 0xffcc00, 0xfff2b0, 0xffffff],
  count: 22,
  speed: 1.8,
  upward: 1.7,
  gravity: 4.0,
  lifeMin: 0.6,
  lifeMax: 0.9,
  size: 0.2,
};
