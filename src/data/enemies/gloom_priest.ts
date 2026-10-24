import type { EnemyDef } from '../schemas';

/**
 * Gloom Priest (spec 6.1, 6.2). Every 3.0 s it heals every enemy within 1.5
 * tiles for 60 health and can never heal itself; it still bites defenders.
 */
export const gloomPriest: EnemyDef = {
  id: 'gloom_priest',
  name: 'Gloom Priest',
  hp: 2200,
  armor: 'spectral',
  speed: 0.09,
  biteDamage: 45,
  biteIntervalS: 0.5,
  isFlying: false,
  special: 'gloom_priest_heal',
  healAmount: 80,
  healRadiusTiles: 1.5,
  healIntervalS: 3,
  isBoss: false,
  milestone: 'M2',
};
