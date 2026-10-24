/**
 * Steam combo (spec 9.7): white steam cloud burst plus the "STEAM!" popup.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'combo_steam',
  sprite: 3,
  colors: [0xf4fbff, 0xd9a066],
  count: 18,
  speed: 1.8,
  upward: 1.0,
  gravity: -0.4,
  lifeMin: 0.5,
  lifeMax: 0.9,
  size: 0.26,
};
