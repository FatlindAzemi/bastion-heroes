/**
 * Victory (spec 9.7): full-screen confetti across the playfield.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'win_confetti',
  sprite: 2,
  colors: [0xff4d4d, 0xffcc00, 0x4cd964, 0x3fa9f5, 0x7c4dff, 0xf4fbff],
  count: 10,
  speed: 2.2,
  upward: 1.2,
  gravity: 5.5,
  lifeMin: 1.0,
  lifeMax: 1.6,
  size: 0.24,
};
