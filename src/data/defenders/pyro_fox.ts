import type { DefenderDef } from '../schemas';

/**
 * Pyro Fox, the Epic Wildgrove lobber (spec 5.1, 5.2). Its Blast fireball applies
 * Burn (4.5); at ★3 it leaves a fire patch that keeps applying Burn.
 */
export const pyroFox: DefenderDef = {
  id: 'pyro_fox',
  name: 'Pyro Fox',
  faction: 'wildgrove',
  rarity: 'epic',
  role: 'shooter',
  cost: 200,
  cooldownS: 15,
  startsReady: false,
  hp: 300,
  pattern: 'lob',
  damage: 25,
  damageType: 'blast',
  attackIntervalS: 2,
  range: 6,
  element: 'fire',
  statusOnHit: { status: 'burn', durationS: 3, value: 6 },
  star3Bonus: 'fire_patch',
  star3Params: { firePatchRadiusTiles: 0.5, firePatchDurationS: 2 },
  milestone: 'M2',
};
