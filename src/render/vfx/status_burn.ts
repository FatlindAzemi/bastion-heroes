/**
 * Burn status (spec 9.7): small flames licking up from the enemy.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'status_burn',
  sprite: 0,
  colors: [0xff8a2b, 0xff4d4d, 0xffcc00],
  count: 3,
  speed: 0.5,
  upward: 1.2,
  gravity: -1.5,
  lifeMin: 0.35,
  lifeMax: 0.6,
  size: 0.16,
};
