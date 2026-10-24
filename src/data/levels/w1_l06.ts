import type { LevelDef } from '../schemas';

/**
 * Whispering Field, W1-L06 (spec 7.2 row 6): the first Shade Wisps teach that
 * Blast is weak against Spectral armor. The first clear unlocks Rune Archer.
 */
export const w1_l06: LevelDef = {
  id: 'w1_l06',
  world: 1,
  number: 6,
  name: 'Whispering Field',
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 6,
  fixedLoadout: null,
  firstWaveDelay: 20,
  // 7.2 row 6: 3g | 2g+2w | 3g+1p | BIG 4g+3w+1s | 3w+2p | FINAL 6g+4w+2s.
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
        { enemy: 'shade_wisp', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloomling', count: 3, lanes: 'random' },
        { enemy: 'pothead', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloomling', count: 4, lanes: 'random' },
        { enemy: 'shade_wisp', count: 3, lanes: 'random' },
        { enemy: 'shieldbearer', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'shade_wisp', count: 3, lanes: 'random' },
        { enemy: 'pothead', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloomling', count: 6, lanes: 'random' },
        { enemy: 'shade_wisp', count: 4, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 110 gold for W1-L06.
  rewards: { gold: 110, unlockDefender: 'rune_archer' },
  seed: 10006,
};
