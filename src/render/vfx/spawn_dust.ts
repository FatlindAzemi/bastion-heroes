/**
 * Spawn dust (spec 9.7): dusty landing ring where a defender lands (spec 9.6).
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'spawn_dust',
  sprite: 0,
  colors: [0xd9a066, 0xf4e3c3, 0xbfa07a],
  count: 14,
  speed: 1.1,
  upward: 0.5,
  gravity: 4.5,
  lifeMin: 0.35,
  lifeMax: 0.6,
  size: 0.16,
};
