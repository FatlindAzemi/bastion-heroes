import type { LevelDef } from '../schemas';

/**
 * Pots and Pans, W1-L04 (spec 7.2 row 4): the first Armored enemies teach that
 * Pierce is weak against Armored targets. The first clear gives a wooden chest
 * and unlocks the free 6-slot loadout (spec 3.12); levels 1 to 4 use a fixed
 * tutorial loadout.
 */
export const w1_l04: LevelDef = {
  id: 'w1_l04',
  world: 1,
  number: 4,
  name: 'Pots and Pans',
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 4,
  fixedLoadout: ['sparkbolt_gremlin', 'glowshroom_monk', 'iron_granny', 'boomcap_brewer'],
  firstWaveDelay: 20,
  // 7.2 row 4: 2g | 2g+1p | 3g | BIG 4g+2p | 3g+2p | FINAL 6g+3p.
  waves: [
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 2, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloomling', count: 2, lanes: 'random' },
        { enemy: 'pothead', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 3, lanes: 'random' }],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [
        { enemy: 'gloomling', count: 4, lanes: 'random' },
        { enemy: 'pothead', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloomling', count: 3, lanes: 'random' },
        { enemy: 'pothead', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloomling', count: 6, lanes: 'random' },
        { enemy: 'pothead', count: 3, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 90 gold for W1-L04.
  rewards: { gold: 90, firstClearChest: 'wooden', unlockFreeLoadout: true },
  seed: 10004,
};
