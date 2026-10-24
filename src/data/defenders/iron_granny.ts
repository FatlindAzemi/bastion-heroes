import type { DefenderDef } from '../schemas';

/**
 * Iron Granny, the Rare Forge Clan wall (spec 5.1, 5.2). She blocks a lane and
 * does not attack; at ★3 she reflects part of the melee damage she takes.
 */
export const ironGranny: DefenderDef = {
  id: 'iron_granny',
  name: 'Iron Granny',
  faction: 'forge',
  rarity: 'rare',
  role: 'wall',
  cost: 75,
  cooldownS: 30,
  startsReady: false,
  hp: 10000,
  pattern: 'wall',
  // A wall does not attack (5.2): damage 0 and no attack interval.
  damage: 0,
  element: 'none',
  crackedArmorRatios: [0.66, 0.33],
  star3Bonus: 'reflect_melee',
  star3Params: { reflectRatio: 0.2 },
  milestone: 'M2',
};
