import type { EnemyDef } from '../schemas';

/**
 * Gloomling, the baseline Gloom enemy (spec 6.1, 6.2). It walks down its lane
 * and eats the first defender in front of it; it has no special behavior.
 */
export const gloomling: EnemyDef = {
  id: 'gloomling',
  name: 'Gloomling',
  hp: 3000,
  armor: 'light',
  speed: 0.11,
  biteDamage: 50,
  biteIntervalS: 0.5,
  isFlying: false,
  isBoss: false,
  milestone: 'M1',
};
