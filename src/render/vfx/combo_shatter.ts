/**
 * Shatter combo (spec 9.7): ice shards flying plus the "SHATTER!" popup.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'combo_shatter',
  sprite: 2,
  colors: [0x9be7ff, 0xf4fbff, 0x3fa9f5],
  count: 16,
  speed: 2.4,
  upward: 1.4,
  gravity: 6.0,
  lifeMin: 0.35,
  lifeMax: 0.6,
  size: 0.18,
};
