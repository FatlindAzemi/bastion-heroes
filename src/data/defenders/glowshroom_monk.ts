import type { DefenderDef } from '../schemas';

/**
 * Glowshroom Monk, the Common Wildgrove producer (spec 5.1, 5.2). It never
 * attacks: it meditates and drops orbs of Essence around itself.
 */
export const glowshroomMonk: DefenderDef = {
  id: 'glowshroom_monk',
  name: 'Glowshroom Monk',
  faction: 'wildgrove',
  rarity: 'common',
  role: 'producer',
  cost: 50,
  cooldownS: 7.5,
  startsReady: true,
  hp: 300,
  pattern: 'producer',
  // A producer does not attack (5.2): damage 0, and the interval is its orb interval.
  damage: 0,
  attackIntervalS: 24,
  element: 'none',
  firstOrbDelayS: 7,
  orbEssence: 25,
  star3Bonus: 'producer_orb_value_up',
  star3Params: { orbEssence: 35 },
  milestone: 'M2',
};
