import { describe, expect, it } from 'vitest';

import { levelById, levels } from '../../src/data';
import { LevelDef } from '../../src/data/schemas';

/** The exact W1-L01 `LevelDef` of spec 7.2 row 1 (first-clear reward from 7.3). */
const expectedLevel = {
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
  rewards: { gold: 60, unlockDefender: 'glowshroom_monk' },
  seed: 10001,
};

describe('W1-L01 level data (spec 7.2 row 1)', () => {
  it('7.1: parses with the LevelDef schema', () => {
    expect(() => LevelDef.parse(levelById['w1_l01'])).not.toThrow();
  });

  it('7.2 row 1: matches First Light exactly', () => {
    expect(levelById['w1_l01']).toEqual(expectedLevel);
  });

  it('7.2: the waves are 1g | 1g | 2g | 2g | FINAL 4g', () => {
    const level = LevelDef.parse(levelById['w1_l01']);
    expect(level.waves.map((wave) => wave.spawns[0]?.count)).toEqual([1, 1, 2, 2, 4]);
    expect(level.waves.map((wave) => wave.flag)).toEqual(['none', 'none', 'none', 'none', 'final']);
    // 7.1 rule 4: duration 0 on the final wave means "no timer, wait until all enemies are dead".
    expect(level.waves[4]?.duration).toBe(0);
    expect(level.waves[4]?.spawnGap).toBe(1.5);
  });

  it('7.3: the first-clear gold follows the reward formula', () => {
    const level = LevelDef.parse(levelById['w1_l01']);
    expect(level.rewards.gold).toBe(50 + 10 * level.number + 20 * (level.world - 1));
    expect(level.rewards.unlockDefender).toBe('glowshroom_monk');
    // 8.4's generic wooden-chest rule for W1 L1-L5 is meta content (M2/M4); 7.2 row 1 lists no chest.
    expect(level.rewards.firstClearChest).toBeUndefined();
  });

  it('11.2: the registry lists the level by id', () => {
    expect(levels.map((level) => level.id)).toEqual(['w1_l01']);
    expect(levelById['w1_l01']).toBe(levels[0]);
  });
});
