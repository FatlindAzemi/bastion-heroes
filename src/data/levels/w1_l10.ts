import type { LevelDef } from '../schemas';

/**
 * Rift's Edge, W1-L10 (spec 7.2 row 10): the World 1 finale combines every M2
 * enemy with two BIG waves. Start Essence is 200 and the first clear gives a gold
 * chest. Morvak joins the FINAL wave only in M7 (spec 7.2 note), not in M2.
 */
export const w1_l10: LevelDef = {
  id: 'w1_l10',
  world: 1,
  number: 10,
  name: "Rift's Edge",
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 200,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 6,
  fixedLoadout: null,
  firstWaveDelay: 20,
  // 7.2 row 10: 5g | 3s+2p | 1og+3w | BIG 6g+3b+2pr | 2og+3p | 4w+3s+3b |
  // BIG 2og+2pr+6g | FINAL 3og+8g+4s+4b+3pr.
  waves: [
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 5, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'shieldbearer', count: 3, lanes: 'random' },
        { enemy: 'pothead', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloom_ogre', count: 1, lanes: 'random' },
        { enemy: 'shade_wisp', count: 3, lanes: 'random' },
      ],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloomling', count: 6, lanes: 'random' },
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
        { enemy: 'gloom_priest', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloom_ogre', count: 2, lanes: 'random' },
        { enemy: 'pothead', count: 3, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'shade_wisp', count: 4, lanes: 'random' },
        { enemy: 'shieldbearer', count: 3, lanes: 'random' },
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
      ],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloom_ogre', count: 2, lanes: 'random' },
        { enemy: 'gloom_priest', count: 2, lanes: 'random' },
        { enemy: 'gloomling', count: 6, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloom_ogre', count: 3, lanes: 'random' },
        { enemy: 'gloomling', count: 8, lanes: 'random' },
        { enemy: 'shieldbearer', count: 4, lanes: 'random' },
        { enemy: 'bat_swarm', count: 4, lanes: 'random' },
        { enemy: 'gloom_priest', count: 3, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 150 gold for W1-L10.
  rewards: { gold: 150, firstClearChest: 'gold' },
  seed: 10010,
};
