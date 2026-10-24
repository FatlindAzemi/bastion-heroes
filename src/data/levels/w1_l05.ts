import type { LevelDef } from '../schemas';

/**
 * Shield Wall, W1-L05 (spec 7.2 row 5): the first free 6-slot loadout and the
 * first Shieldbearers, teaching that straight shots hit the shield while lobs,
 * beams and splash hit the body. The first clear unlocks Snowpup Yeti.
 */
export const w1_l05: LevelDef = {
  id: 'w1_l05',
  world: 1,
  number: 5,
  name: 'Shield Wall',
  activeLanes: [0, 1, 2, 3, 4],
  startEssence: 150,
  skyDrops: true,
  terrain: [],
  loadoutSlots: 6,
  fixedLoadout: null,
  firstWaveDelay: 20,
  // 7.2 row 5: 3g | 2g+1s | 3g+1p | BIG 5g+2s | 3g+2s+1p | FINAL 6g+3s+2p.
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
        { enemy: 'shieldbearer', count: 1, lanes: 'random' },
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
        { enemy: 'gloomling', count: 5, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
      ],
    },
    {
      flag: 'none',
      duration: 25,
      spawnGap: 3,
      spawns: [
        { enemy: 'gloomling', count: 3, lanes: 'random' },
        { enemy: 'shieldbearer', count: 2, lanes: 'random' },
        { enemy: 'pothead', count: 1, lanes: 'random' },
      ],
    },
    {
      flag: 'final',
      duration: 0,
      spawnGap: 1.5,
      spawns: [
        { enemy: 'gloomling', count: 6, lanes: 'random' },
        { enemy: 'shieldbearer', count: 3, lanes: 'random' },
        { enemy: 'pothead', count: 2, lanes: 'random' },
      ],
    },
  ],
  // 7.3: 50 + 10 * level number + 20 * (world - 1) = 100 gold for W1-L05.
  rewards: { gold: 100, unlockDefender: 'snowpup_yeti' },
  seed: 10005,
};
