import type { LevelDef } from '../schemas';

/**
 * First Light, the W1-L01 tutorial level (spec 7.2 row 1): a single active lane,
 * a fixed Sparkbolt Gremlin and five small Gloomling waves. The first clear
 * unlocks the Glowshroom Monk. Loadout slots are 1 because levels 1 to 4 use
 * fewer, pre-chosen slots (spec 3.12).
 */
export const w1_l01: LevelDef = {
  id: 'w1_l01',
  world: 1,
  number: 1,
  name: 'First Light',
  activeLanes: [2],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 1,
  fixedLoadout: ['sparkbolt_gremlin'],
  firstWaveDelay: 20,
  // 7.2 row 1: 1g | 1g | 2g | 2g | FINAL 4g, normal waves 25 s / 3 s, final 0 s / 1.5 s.
  waves: [
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 1, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 1, lanes: 'random' }],
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
      spawns: [{ enemy: 'gloomling', count: 2, lanes: 'random' }],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [{ enemy: 'gloomling', count: 4, lanes: 'random' }],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 60 gold for W1-L01.
  rewards: { gold: 60, unlockDefender: 'glowshroom_monk' },
  seed: 10001,
};
