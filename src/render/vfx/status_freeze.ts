/**
 * Freeze status (spec 9.7): ice snowflakes plus the translucent ice block of `statusMeshes.ts`.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'status_freeze',
  sprite: 4,
  colors: [0x9be7ff, 0xf4fbff],
  count: 3,
  speed: 0.5,
  upward: 0.5,
  gravity: -0.2,
  lifeMin: 0.6,
  lifeMax: 0.9,
  size: 0.14,
};
