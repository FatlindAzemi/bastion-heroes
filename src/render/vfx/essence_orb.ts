/**
 * Essence orb (spec 9.7): teal glow and sparkle trail handled by `orbGlow.ts`.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'essence_orb',
  sprite: 1,
  colors: [0x3bf0c8, 0xf4fbff],
  count: 2,
  speed: 0.4,
  upward: 0.8,
  gravity: -0.3,
  lifeMin: 0.5,
  lifeMax: 0.8,
  size: 0.12,
};
