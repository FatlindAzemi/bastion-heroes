/**
 * Trap fire (spec 9.7): rolling log with dust and leaves (trapLogs.ts).
 *
 * Spec 9.7 (issue #75). Data-only: the shared particle system in
 * `src/render/particles.ts` turns this preset into sprite particles, so every VFX
 * id lives in its own module without duplicating the render loop.
 */

import type { VfxDefinition } from './types';

export const vfx: VfxDefinition = {
  id: 'trap_roll',
  sprite: 3,
  colors: [0x6f4526, 0xd9a066, 0x2e7d32],
  count: 16,
  speed: 1.2,
  upward: 0.6,
  gravity: 3.5,
  lifeMin: 0.4,
  lifeMax: 0.7,
  size: 0.18,
};
