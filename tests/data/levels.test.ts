import { describe, expect, it } from 'vitest';

import { enemyById, levelById, levels } from '../../src/data';
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
    expect(levels.map((level) => level.id)).toContain('w1_l01');
    expect(levelById['w1_l01']).toBe(levels[0]);
  });
});

/** One expected World 1 row of the 7.2 table. */
interface ExpectedWorld1Row {
  readonly number: number;
  readonly name: string;
  readonly lanes: number[];
  readonly startEssence: number;
  readonly loadoutSlots: number;
  readonly fixedLoadout: string[] | null;
  readonly gold: number;
  readonly firstClearChest?: 'wooden' | 'silver' | 'gold';
  readonly unlockDefender?: string;
  readonly unlockFreeLoadout?: boolean;
  /** The wave notation of the 7.2 table, e.g. "BIG 4g+2p". */
  readonly waves: readonly string[];
}

/** Lanes 0-4: every World 1 level except L02 uses all five lanes (spec 7.2). */
const ALL_LANES = [0, 1, 2, 3, 4];

/** The enemy codes of the 7.2 notation. */
const ENEMY_CODES = {
  g: 'gloomling',
  p: 'pothead',
  s: 'shieldbearer',
  w: 'shade_wisp',
  b: 'bat_swarm',
  pr: 'gloom_priest',
  og: 'gloom_ogre',
} as const;

type EnemyCode = keyof typeof ENEMY_CODES;

/** World 1 wave timing (spec 7.2): normal 25 s / 3 s, BIG 30 s / 2 s, FINAL 0 s / 1.5 s. */
const WAVE_TIMING = {
  none: { duration: 25, spawnGap: 3 },
  big: { duration: 30, spawnGap: 2 },
  final: { duration: 0, spawnGap: 1.5 },
} as const;

type WaveFlag = keyof typeof WAVE_TIMING;

/** Expands one 7.2 wave token like "BIG 4g+2p" into the expected wave definition. */
function waveFromNotation(token: string): LevelDef['waves'][number] {
  const flag: WaveFlag = token.startsWith('BIG ')
    ? 'big'
    : token.startsWith('FINAL ')
      ? 'final'
      : 'none';
  const body = token.replace(/^(BIG|FINAL) /, '');
  const spawns = body.split('+').map((group) => {
    const match = /^(\d+)([a-z]+)$/.exec(group);
    const code = match?.[2] as EnemyCode | undefined;
    if (match === null || code === undefined) {
      throw new Error(`Bad 7.2 wave token "${token}"`);
    }
    return { enemy: ENEMY_CODES[code], count: Number(match[1]), lanes: 'random' as const };
  });
  const timing = WAVE_TIMING[flag];
  return { flag, duration: timing.duration, spawnGap: timing.spawnGap, spawns };
}

/** Builds the exact LevelDef expected for one 7.2 row (common 7.1 fields included). */
function expectedWorld1Level(row: ExpectedWorld1Row): LevelDef {
  const rewards: LevelDef['rewards'] = { gold: row.gold };
  if (row.firstClearChest !== undefined) {
    rewards.firstClearChest = row.firstClearChest;
  }
  if (row.unlockDefender !== undefined) {
    rewards.unlockDefender = row.unlockDefender;
  }
  if (row.unlockFreeLoadout !== undefined) {
    rewards.unlockFreeLoadout = row.unlockFreeLoadout;
  }
  return {
    id: `w1_l${String(row.number).padStart(2, '0')}`,
    world: 1,
    number: row.number,
    name: row.name,
    activeLanes: row.lanes,
    startEssence: row.startEssence,
    skyDrops: true,
    terrain: [],
    loadoutSlots: row.loadoutSlots,
    fixedLoadout: row.fixedLoadout,
    firstWaveDelay: 20,
    waves: row.waves.map(waveFromNotation),
    rewards,
    seed: 10000 + row.number,
  };
}

/** The nine World 1 rows 2-10 of spec 7.2, transcribed with the spec's own notation. */
const WORLD_1_ROWS: readonly ExpectedWorld1Row[] = [
  {
    number: 2,
    name: 'Village Path',
    lanes: [1, 2, 3],
    startEssence: 150,
    loadoutSlots: 2,
    fixedLoadout: ['sparkbolt_gremlin', 'glowshroom_monk'],
    gold: 70,
    unlockDefender: 'iron_granny',
    waves: ['2g', '2g', '3g', 'BIG 4g', '3g', 'FINAL 6g'],
  },
  {
    number: 3,
    name: "Granny's Gate",
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 3,
    fixedLoadout: ['sparkbolt_gremlin', 'glowshroom_monk', 'iron_granny'],
    gold: 80,
    unlockDefender: 'boomcap_brewer',
    waves: ['2g', '3g', '4g', 'BIG 6g', '4g', 'FINAL 8g'],
  },
  {
    number: 4,
    name: 'Pots and Pans',
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 4,
    fixedLoadout: ['sparkbolt_gremlin', 'glowshroom_monk', 'iron_granny', 'boomcap_brewer'],
    gold: 90,
    firstClearChest: 'wooden',
    unlockFreeLoadout: true,
    waves: ['2g', '2g+1p', '3g', 'BIG 4g+2p', '3g+2p', 'FINAL 6g+3p'],
  },
  {
    number: 5,
    name: 'Shield Wall',
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 6,
    fixedLoadout: null,
    gold: 100,
    unlockDefender: 'snowpup_yeti',
    waves: ['3g', '2g+1s', '3g+1p', 'BIG 5g+2s', '3g+2s+1p', 'FINAL 6g+3s+2p'],
  },
  {
    number: 6,
    name: 'Whispering Field',
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 6,
    fixedLoadout: null,
    gold: 110,
    unlockDefender: 'rune_archer',
    waves: ['3g', '2g+2w', '3g+1p', 'BIG 4g+3w+1s', '3w+2p', 'FINAL 6g+4w+2s'],
  },
  {
    number: 7,
    name: 'Wings at Dusk',
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 6,
    fixedLoadout: null,
    gold: 120,
    firstClearChest: 'silver',
    waves: ['3g', '2g+2b', '2s+2w', 'BIG 5g+3b+1p', '3g+3b', 'FINAL 6g+4b+2s+2w'],
  },
  {
    number: 8,
    name: "Priest's Procession",
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 6,
    fixedLoadout: null,
    gold: 130,
    firstClearChest: 'silver',
    waves: ['4g', '2g+1pr', '3w+2s', 'BIG 5g+2pr+2p', '3b+2w+1pr', '2s+3p', 'FINAL 7g+3pr+3b+2s'],
  },
  {
    number: 9,
    name: 'The Ogre Bridge',
    lanes: ALL_LANES,
    startEssence: 150,
    loadoutSlots: 6,
    fixedLoadout: null,
    gold: 140,
    firstClearChest: 'silver',
    waves: ['4g', '1og+2g', '3p+2s', 'BIG 1og+5g+2pr', '3b+3w', '2og+2s', 'FINAL 2og+6g+3p+2pr+3b'],
  },
  {
    number: 10,
    name: "Rift's Edge",
    lanes: ALL_LANES,
    startEssence: 200,
    loadoutSlots: 6,
    fixedLoadout: null,
    gold: 150,
    firstClearChest: 'gold',
    waves: [
      '5g',
      '3s+2p',
      '1og+3w',
      'BIG 6g+3b+2pr',
      '2og+3p',
      '4w+3s+3b',
      'BIG 2og+2pr+6g',
      'FINAL 3og+8g+4s+4b+3pr',
    ],
  },
];

describe('World 1 levels L02-L10 (spec 7.2 rows 2-10)', () => {
  it('7.2: the registry lists all ten World 1 levels in order and every one parses', () => {
    const expectedIds = Array.from(
      { length: 10 },
      (_, index) => `w1_l${String(index + 1).padStart(2, '0')}`,
    );
    expect(levels.map((level) => level.id)).toEqual(expectedIds);
    for (const level of levels) {
      expect(() => LevelDef.parse(level), level.id).not.toThrow();
    }
  });

  for (const row of WORLD_1_ROWS) {
    it(`7.2 row ${row.number}: ${row.name} matches the spec exactly`, () => {
      const id = `w1_l${String(row.number).padStart(2, '0')}`;
      expect(LevelDef.parse(levelById[id])).toEqual(expectedWorld1Level(row));
    });
  }

  it('7.2: every wave enemy id is registered and every first-clear gold matches 7.3', () => {
    for (const level of levels.map((entry) => LevelDef.parse(entry))) {
      for (const wave of level.waves) {
        for (const spawn of wave.spawns) {
          expect(enemyById[spawn.enemy], `${level.id}: ${spawn.enemy}`).toBeDefined();
        }
      }
      // 7.3: gold = 50 + 10 * level number + 20 * (world - 1); all levels are World 1.
      expect(level.rewards.gold, level.id).toBe(50 + 10 * level.number + 20 * (level.world - 1));
    }
  });
});
