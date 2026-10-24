import type { DefenderDef } from '../schemas';

/**
 * Frost Witch, the Epic Frostborn beam caster (spec 5.1, 5.2). Her beam hits every
 * enemy in range and applies Slow, with every 4th attack applying Freeze instead;
 * at ★3 her range grows.
 */
export const frostWitch: DefenderDef = {
  id: 'frost_witch',
  name: 'Frost Witch',
  faction: 'frost',
  rarity: 'epic',
  role: 'control',
  cost: 200,
  cooldownS: 20,
  startsReady: false,
  hp: 4300,
  pattern: 'beam',
  damage: 145,
  damageType: 'arcane',
  attackIntervalS: 2,
  range: 4,
  hitsFlying: true,
  element: 'frost',
  statusOnHit: { status: 'slow', durationS: 3, value: 0.5 },
  freezeEveryNthAttack: 4,
  star3Bonus: 'range_up',
  star3Params: { range: 6 },
  milestone: 'M2',
};
