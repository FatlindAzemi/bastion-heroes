import type { LevelDef } from '../schemas';

/**
 * The Ogre Bridge, W1-L09 (spec 7.2 row 9): the first Gloom Ogres teach that
 * tanks need slow, walls and Blast damage. The first clear gives a silver chest.
 */
export const w1_l09: LevelDef = {
  id: 'w1_l09',
  world: 1,
  number: 9,
  name: 'The Ogre Bridge',
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 6,
  fixedLoadout: null,
  firstWaveDelay: 20,
  // 7.2 row 9: 4g | 1og+2g | 3p+2s | BIG 1og+5g+2pr | 3b+3w | 2og+2s | FINAL 2og+6g+3p+2pr+3b.
  waves: [
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 4, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloom_ogre', count: 1, lanes: 'random' },
        { enemy: 'gloomling', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'pothead', count: 3, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloom_ogre', count: 1, lanes: 'random' },
        { enemy: 'gloomling', count: 5, lanes: 'random' },
        { enemy: 'gloom_priest', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
        { enemy: 'shade_wisp', count: 3, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloom_ogre', count: 2, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloom_ogre', count: 2, lanes: 'random' },
        { enemy: 'gloomling', count: 6, lanes: 'random' },
        { enemy: 'pothead', count: 3, lanes: 'random' },
        { enemy: 'gloom_priest', count: 2, lanes: 'random' },
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 140 gold for W1-L09.
  rewards: { gold: 140, firstClearChest: 'silver' },
  seed: 10009,
};
