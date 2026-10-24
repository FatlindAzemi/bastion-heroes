import type { EnemyDef } from '../schemas';

/**
 * Pot-Head Gloomling (spec 6.1, 6.2). A Gloomling with a cooking pot for armor:
 * while the pot holds it is Armored, at 200 health the pot falls off and the
 * body becomes Light (the renderer swaps to the no-pot model).
 */
export const pothead: EnemyDef = {
  id: 'pothead',
  name: 'Pot-Head Gloomling',
  hp: 4500,
  armor: 'armored',
  speed: 0.11,
  biteDamage: 50,
  biteIntervalS: 0.5,
  isFlying: false,
  special: 'pot_armor',
  armorBreakHp: 200,
  armorAfterBreak: 'light',
  isBoss: false,
  milestone: 'M2',
};
