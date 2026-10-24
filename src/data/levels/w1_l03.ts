import type { LevelDef } from '../schemas';

/**
 * Granny's Gate, W1-L03 (spec 7.2 row 3): all lanes and the first wall, showing
 * how walls protect shooters. The first clear unlocks Boomcap Brewer; levels 1
 * to 4 use a fixed tutorial loadout (spec 3.12).
 */
export const w1_l03: LevelDef = {
  id: 'w1_l03',
  world: 1,
  number: 3,
  name: "Granny's Gate",
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 3,
  fixedLoadout: ['sparkbolt_gremlin', 'glowshroom_monk', 'iron_granny'],
  firstWaveDelay: 20,
  // 7.2 row 3: 2g | 3g | 4g | BIG 6g | 4g | FINAL 8g.
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
      spawns: [{ enemy: 'gloomling', count: 3, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 4, lanes: 'random' }],
    },
    {
      flag: 'big',
      duration: 30,
      spawnGap: 2,
      spawns: [{ enemy: 'gloomling', count: 6, lanes: 'random' }],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [{ enemy: 'gloomling', count: 4, lanes: 'random' }],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [{ enemy: 'gloomling', count: 8, lanes: 'random' }],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 80 gold for W1-L03.
  rewards: { gold: 80, unlockDefender: 'boomcap_brewer' },
  seed: 10003,
};
