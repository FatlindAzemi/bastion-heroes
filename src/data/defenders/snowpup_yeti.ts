import type { DefenderDef } from '../schemas';

/**
 * Snowpup Yeti, the Common Frostborn straight shooter (spec 5.1, 5.2). Every
 * Pierce hit applies Slow (4.5); at ★3 the Slow lasts longer.
 */
export const snowpupYeti: DefenderDef = {
  id: 'snowpup_yeti',
  name: 'Snowpup Yeti',
  faction: 'frost',
  rarity: 'common',
  role: 'shooter',
  cost: 175,
  cooldownS: 7.5,
  startsReady: true,
  hp: 300,
  pattern: 'straight',
  damage: 20,
  damageType: 'pierce',
  attackIntervalS: 1.4,
  range: 9,
  element: 'frost',
  statusOnHit: { status: 'slow', durationS: 3, value: 0.5 },
  star3Bonus: 'slow_duration_up',
  star3Params: { slowDurationS: 5 },
  milestone: 'M2',
};
