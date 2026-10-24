/**
 * Poison status (spec 9.7): green bubbles rising from the enemy.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'status_poison',
  sprite: 0,
  colors: [0x7cff6b, 0x2e7d32],
  count: 4,
  speed: 0.4,
  upward: 1.0,
  gravity: -0.8,
  lifeMin: 0.5,
  lifeMax: 0.9,
  size: 0.13,
};
