/**
 * Defender death poof (spec 9.6/9.7): gold star burst.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'death_poof_defender',
  sprite: 1,
  colors: [0xffd54a, 0xffcc00, 0xfff2b0],
  count: 20,
  speed: 2.0,
  upward: 1.5,
  gravity: 5.0,
  lifeMin: 0.5,
  lifeMax: 0.8,
  size: 0.18,
};
