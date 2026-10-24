import type { LevelDef } from '../schemas';

/**
 * Priest's Procession, W1-L08 (spec 7.2 row 8): the first Gloom Priests teach
 * focus fire so their healing cannot undo chip damage. The first clear gives a
 * silver chest.
 */
export const w1_l08: LevelDef = {
  id: 'w1_l08',
  world: 1,
  number: 8,
  name: "Priest's Procession",
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 6,
  fixedLoadout: null,
  firstWaveDelay: 20,
  // 7.2 row 8: 4g | 2g+1pr | 3w+2s | BIG 5g+2pr+2p | 3b+2w+1pr | 2s+3p | FINAL 7g+3pr+3b+2s.
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
        { enemy: 'gloomling', count: 2, lanes: 'random' },
        { enemy: 'gloom_priest', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'shade_wisp', count: 3, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloomling', count: 5, lanes: 'random' },
        { enemy: 'gloom_priest', count: 2, lanes: 'random' },
        { enemy: 'pothead', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
        { enemy: 'shade_wisp', count: 2, lanes: 'random' },
        { enemy: 'gloom_priest', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
        { enemy: 'pothead', count: 3, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloomling', count: 7, lanes: 'random' },
        { enemy: 'gloom_priest', count: 3, lanes: 'random' },
        { enemy: 'bat_swarm', count: 3, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 130 gold for W1-L08.
  rewards: { gold: 130, firstClearChest: 'silver' },
  seed: 10008,
};
