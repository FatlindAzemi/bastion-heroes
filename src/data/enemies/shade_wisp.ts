import type { EnemyDef } from '../schemas';

/**
 * Shade Wisp (spec 6.1, 6.2). Spectral armor punishes Blast-only loadouts; it
 * floats on the ground (not flying) and has no special behavior.
 */
export const shadeWisp: EnemyDef = {
  id: 'shade_wisp',
  name: 'Shade Wisp',
  hp: 2000,
  armor: 'spectral',
  speed: 0.13,
  biteDamage: 45,
  biteIntervalS: 0.5,
  isFlying: false,
  isBoss: false,
  milestone: 'M2',
};
