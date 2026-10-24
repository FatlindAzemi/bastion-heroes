/**
 * Enemy death poof (spec 9.6/9.7): purple smoke puff.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'death_poof_enemy',
  sprite: 3,
  colors: [0x4a2f66, 0x7c4dff, 0x2b1b3d, 0xa64dff],
  count: 18,
  speed: 1.4,
  upward: 1.1,
  gravity: -0.3,
  lifeMin: 0.5,
  lifeMax: 0.8,
  size: 0.2,
};
