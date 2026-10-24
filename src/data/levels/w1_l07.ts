import type { LevelDef } from '../schemas';

/**
 * Wings at Dusk, W1-L07 (spec 7.2 row 7): the first Bat Swarms teach that flying
 * enemies need anti-air defenders. The first clear gives a silver chest.
 */
export const w1_l07: LevelDef = {
  id: 'w1_l07',
  world: 1,
  number: 7,
  name: 'Wings at Dusk',
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 6,
  fixedLoadout: null,
  firstWaveDelay: 20,
  // 7.2 row 7: 3g | 2g+2b | 2s+2w | BIG 5g+3b+1p | 3g+3b | FINAL 6g+4b+2s+2w.
  waves: [
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 3, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloomling', count: 2, lanes: 'random' },
        { enemy: 'bat_swarm', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
        { enemy: 'shade_wisp', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloomling', count: 5, lanes: 'random' },
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
        { enemy: 'pothead', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloomling', count: 3, lanes: 'random' },
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloomling', count: 6, lanes: 'random' },
        { enemy: 'bat_swarm', count: 4, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
        { enemy: 'shade_wisp', count: 2, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 120 gold for W1-L07.
  rewards: { gold: 120, firstClearChest: 'silver' },
  seed: 10007,
};
