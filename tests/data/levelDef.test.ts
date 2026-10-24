import { describe, expect, it } from 'vitest';

import { LevelDef } from '../../src/data/schemas';

/** The W1-L05 `LevelDef` example of spec 7.1, used here as a test fixture. */
const shieldWallExample = {
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
    { flag: 'big', duration: 30, spawnGap: 2, spawns: [] },
    { flag: 'final', duration: 0, spawnGap: 1.5, spawns: [] },
  ],
  rewards: { gold: 100, firstClearChest: 'wooden', unlockDefender: 'snowpup_yeti' },
  seed: 10005,
};

/** A minimal valid level: every optional field is omitted so the defaults apply. */
const minimalLevel = {
  id: 'w1_l01',
  world: 1,
  number: 1,
  name: 'First Light',
  activeLanes: [2],
  startEssence: 150,
  skyDrops: true,
  loadoutSlots: 6,
  waves: [{ spawns: [{ enemy: 'gloomling', count: 1, lanes: 'random' }] }],
  rewards: { gold: 60 },
  seed: 10001,
};

describe('LevelDef schema (spec 7.1)', () => {
  it('7.1: the spec example level parses', () => {
    const level = LevelDef.parse(shieldWallExample);
    expect(level.id).toBe('w1_l05');
    expect(level.activeLanes).toEqual([0, 1, 2, 3, 4]);
    expect(level.waves.map((wave) => wave.flag)).toEqual(['none', 'none', 'big', 'final']);
    // 7.1 rule 4: duration 0 on the final wave means "no timer".
    expect(level.waves[3]?.duration).toBe(0);
  });

  it('7.1 rule 5 and 3.10: omitted fields get their spec defaults', () => {
    const level = LevelDef.parse(minimalLevel);
    expect(level.firstWaveDelay).toBe(20);
    expect(level.terrain).toEqual([]);
    expect(level.fixedLoadout).toBeNull();
    expect(level.waves[0]).toMatchObject({ flag: 'none', duration: 25, spawnGap: 3 });
  });

  it('7.1: invalid level data is rejected', () => {
    expect(() => LevelDef.parse({ ...minimalLevel, waves: [] })).toThrow();
    expect(() => LevelDef.parse({ ...minimalLevel, activeLanes: [5] })).toThrow();
    expect(() => LevelDef.parse({ ...minimalLevel, skyDrops: 'yes' })).toThrow();
    expect(() =>
      LevelDef.parse({ ...minimalLevel, waves: [{ flag: 'huge', spawns: [] }] }),
    ).toThrow();
  });
});
