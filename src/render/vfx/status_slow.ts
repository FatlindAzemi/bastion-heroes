/**
 * Slow status (spec 9.7): blue sparkles and the blue tint mesh of `statusMeshes.ts`.
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'status_slow',
  sprite: 4,
  colors: [0x3fa9f5, 0x9be7ff],
  count: 4,
  speed: 0.6,
  upward: 0.8,
  gravity: -0.4,
  lifeMin: 0.5,
  lifeMax: 0.9,
  size: 0.12,
};
