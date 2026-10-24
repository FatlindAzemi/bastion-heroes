import type { DefenderDef } from '../schemas';

/**
 * Boomcap Brewer, the Common Wildgrove splash artillery (spec 5.1, 5.2). It lobs
 * an exploding cap: full Blast damage to the target, 50 % to everything in the
 * splash radius (4.3).
 */
export const boomcapBrewer: DefenderDef = {
  id: 'boomcap_brewer',
  name: 'Boomcap Brewer',
  faction: 'wildgrove',
  rarity: 'common',
  role: 'shooter',
  cost: 150,
  cooldownS: 7.5,
  startsReady: true,
  hp: 300,
  pattern: 'splash',
  damage: 40,
  damageType: 'blast',
  attackIntervalS: 2.8,
  range: 9,
  splashRadius: 0.8,
  element: 'none',
  star3Bonus: 'splash_radius_up',
  star3Params: { splashRadius: 1.2 },
  milestone: 'M2',
};
