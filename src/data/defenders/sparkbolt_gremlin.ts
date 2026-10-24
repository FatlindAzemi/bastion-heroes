import type { DefenderDef } from '../schemas';

/**
 * Sparkbolt Gremlin, the Common Forge Clan straight-line shooter (spec 5.1,
 * 5.2). It fires Pierce bolts along its lane at the first enemy in range.
 */
export const sparkboltGremlin: DefenderDef = {
  id: 'sparkbolt_gremlin',
  name: 'Sparkbolt Gremlin',
  faction: 'forge',
  rarity: 'common',
  role: 'shooter',
  cost: 150,
  cooldownS: 7.5,
  startsReady: true,
  hp: 4200,
  pattern: 'straight',
  damage: 85,
  damageType: 'pierce',
  attackIntervalS: 1.4,
  range: 9,
  element: 'none',
  star3Bonus: 'double_bolt',
  star3Params: { boltCount: 2, boltGapSeconds: 0.15 },
  milestone: 'M2',
};
