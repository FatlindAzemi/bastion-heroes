/**
 * Arcane hit (spec 9.7): cyan rune flash on the struck enemy.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'hit_arcane',
  sprite: 5,
  colors: [0x7c4dff, 0x3cf2ff, 0xa64dff],
  count: 8,
  speed: 1.4,
  upward: 0.8,
  gravity: 1.5,
  lifeMin: 0.3,
  lifeMax: 0.5,
  size: 0.26,
};
