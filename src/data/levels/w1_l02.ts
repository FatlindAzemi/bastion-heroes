import type { LevelDef } from '../schemas';

/**
 * Village Path, W1-L02 (spec 7.2 row 2): lanes 1-3, the first fixed producer, and
 * six Gloomling waves that teach building economy early. The first clear unlocks
 * Iron Granny; levels 1 to 4 use a fixed tutorial loadout (spec 3.12).
 */
export const w1_l02: LevelDef = {
  id: 'w1_l02',
  world: 1,
  number: 2,
  name: 'Village Path',
  activeLanes: [1, 2, 3],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 2,
  fixedLoadout: ['sparkbolt_gremlin', 'glowshroom_monk'],
  firstWaveDelay: 20,
  // 7.2 row 2: 2g | 2g | 3g | BIG 4g | 3g | FINAL 6g.
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
      spawns: [{ enemy: 'gloomling', count: 2, lanes: 'random' }],
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
      spawns: [{ enemy: 'gloomling', count: 4, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 3, lanes: 'random' }],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [{ enemy: 'gloomling', count: 6, lanes: 'random' }],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 70 gold for W1-L02.
  rewards: { gold: 70, unlockDefender: 'iron_granny' },
  seed: 10002,
};
