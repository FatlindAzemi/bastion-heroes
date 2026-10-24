/**
 * Pierce hit (spec 9.7): yellow spark burst on the struck enemy.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'hit_pierce',
  sprite: 2,
  colors: [0xffcc00, 0xfff2b0, 0xff8a2b],
  count: 10,
  speed: 2.2,
  upward: 1.2,
  gravity: 6.0,
  lifeMin: 0.25,
  lifeMax: 0.45,
  size: 0.18,
};
