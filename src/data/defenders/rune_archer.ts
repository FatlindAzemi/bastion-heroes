import type { DefenderDef } from '../schemas';

/**
 * Rune Archer, the Rare Neon Arcana marksman (spec 5.1, 5.2). Its Arcane arrows
 * can hit flying enemies; at ★3 an arrow passes through the first enemy and hits
 * a second one.
 */
export const runeArcher: DefenderDef = {
  id: 'rune_archer',
  name: 'Rune Archer',
  faction: 'neon',
  rarity: 'rare',
  role: 'shooter',
  cost: 150,
  cooldownS: 7.5,
  startsReady: true,
  hp: 4200,
  pattern: 'straight',
  damage: 155,
  damageType: 'arcane',
  attackIntervalS: 1.5,
  range: 9,
  hitsFlying: true,
  element: 'none',
  star3Bonus: 'piercing_arrow',
  star3Params: { extraHits: 1 },
  milestone: 'M2',
};
