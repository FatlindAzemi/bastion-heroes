import { describe, expect, it } from 'vitest';

import { LevelDef } from '../../src/data/schemas';
import { createTestLevel } from '../sim/testLevel';
import {
  buildBotMetrics,
  buildLevelReport,
  buildWorldReport,
  formatJson,
  formatMarkdown,
} from '../../tools/balance-sim/report';
import type { BotId, RunResult, TargetEvaluation } from '../../tools/balance-sim/types';

/** A schema-valid test level of world 1 with an explicit number (spec 7.2). */
function testLevelAt(number: number): LevelDef {
  return LevelDef.parse({
    ...createTestLevel(),
    id: `w1_l${String(number).padStart(2, '0')}`,
    number,
    name: `Level ${number}`,
  });
}

/** Options of a synthetic run used to test the 16.3 thresholds. */
interface RunOptions {
  wins: number;
  threeStar?: number;
  trapWins?: number;
  durationSeconds?: number;
  essenceSpent?: number;
  essenceAvailable?: number;
  placed?: string[];
}

let nextRunSeed = 0;

/** Builds synthetic runs with a fixed win/star/duration profile. */
function makeRuns(
  botId: BotId,
  runs: RunOptions & { total: number },
  levelId = 'test_level',
): RunResult[] {
  const result: RunResult[] = [];
  for (let index = 0; index < runs.total; index += 1) {
    const won = index < runs.wins;
    const stars: RunResult['stars'] = won ? (index < (runs.threeStar ?? 0) ? 3 : 2) : 0;
    result.push({
      levelId,
      botId,
      runSeed: nextRunSeed,
      status: won ? 'won' : 'lost',
      stars,
      durationTicks: Math.round((runs.durationSeconds ?? 200) * 30),
      essenceSpent: runs.essenceSpent ?? 80,
      essenceAvailable: runs.essenceAvailable ?? 100,
      trapUsed: won && index < (runs.trapWins ?? 0),
      placedDefenderIds: won ? (runs.placed ?? []) : [],
      timedOut: false,
    });
    nextRunSeed += 1;
  }
  return result;
}

/** Finds one evaluated target by id. */
function targetOf(targets: readonly TargetEvaluation[], id: string): TargetEvaluation {
  const target = targets.find((candidate) => candidate.id === id);
  if (target === undefined) {
    throw new Error(`target "${id}" was not evaluated`);
  }
  return target;
}

describe('16.3 idle target', () => {
  it('16.3: idle fails when it wins a post-tutorial level', () => {
    const level = testLevelAt(2);
    const targets = buildLevelReport(level, makeRuns('idle', { total: 50, wins: 1 })).targets;

    expect(targetOf(targets, 'idle-win-rate').pass).toBe(false);
  });

  it('16.3: idle passes with 0 % wins on a post-tutorial level', () => {
    const level = testLevelAt(2);
    const targets = buildLevelReport(level, makeRuns('idle', { total: 50, wins: 0 })).targets;

    expect(targetOf(targets, 'idle-win-rate').pass).toBe(true);
  });

  it('16.3: W1-L01 is the tutorial and has no idle target', () => {
    const level = testLevelAt(1);
    const targets = buildLevelReport(level, makeRuns('idle', { total: 50, wins: 5 })).targets;

    expect(targets.some((target) => target.id === 'idle-win-rate')).toBe(false);
  });
});

describe('16.3 random target', () => {
  it('16.3: random has no target before L04', () => {
    const level = testLevelAt(3);
    const targets = buildLevelReport(level, makeRuns('random', { total: 50, wins: 40 })).targets;

    expect(targets.some((target) => target.id === 'random-win-rate')).toBe(false);
  });

  it('16.3: random passes at exactly 30 % from L04', () => {
    const level = testLevelAt(4);
    const targets = buildLevelReport(level, makeRuns('random', { total: 50, wins: 15 })).targets;

    expect(targetOf(targets, 'random-win-rate').pass).toBe(true);
  });

  it('16.3: random fails above 30 % from L04', () => {
    const level = testLevelAt(4);
    const targets = buildLevelReport(level, makeRuns('random', { total: 50, wins: 16 })).targets;

    expect(targetOf(targets, 'random-win-rate').pass).toBe(false);
  });
});

describe('16.3 commons target', () => {
  it('16.3: commons needs 90 % on L01-L05', () => {
    const level = testLevelAt(5);
    const passing = buildLevelReport(level, makeRuns('commons', { total: 50, wins: 45 })).targets;
    const failing = buildLevelReport(level, makeRuns('commons', { total: 50, wins: 44 })).targets;

    expect(targetOf(passing, 'commons-win-rate').pass).toBe(true);
    expect(targetOf(failing, 'commons-win-rate').pass).toBe(false);
  });

  it('16.3: commons needs 70 % on L06-L10', () => {
    const level = testLevelAt(6);
    const passing = buildLevelReport(level, makeRuns('commons', { total: 50, wins: 35 })).targets;
    const failing = buildLevelReport(level, makeRuns('commons', { total: 50, wins: 34 })).targets;

    expect(targetOf(passing, 'commons-win-rate').pass).toBe(true);
    expect(targetOf(failing, 'commons-win-rate').pass).toBe(false);
  });
});

describe('16.3 recommended targets', () => {
  it('16.3: recommended needs at least 95 % wins', () => {
    const level = testLevelAt(5);
    const passing = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 48 }),
    ).targets;
    const failing = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 47 }),
    ).targets;

    expect(targetOf(passing, 'recommended-win-rate').pass).toBe(true);
    expect(targetOf(failing, 'recommended-win-rate').pass).toBe(false);
  });

  it('16.3: recommended 3-star rate must be 40-80 %', () => {
    const level = testLevelAt(5);
    const forty = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, threeStar: 20 }),
    ).targets;
    const thirtyNine = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, threeStar: 19 }),
    ).targets;
    const eighty = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, threeStar: 40 }),
    ).targets;
    const eightyTwo = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, threeStar: 41 }),
    ).targets;

    expect(targetOf(forty, 'recommended-three-star-rate').pass).toBe(true);
    expect(targetOf(thirtyNine, 'recommended-three-star-rate').pass).toBe(false);
    expect(targetOf(eighty, 'recommended-three-star-rate').pass).toBe(true);
    expect(targetOf(eightyTwo, 'recommended-three-star-rate').pass).toBe(false);
  });

  it('16.3: recommended duration must be 3:00-5:00 minutes', () => {
    const level = testLevelAt(5);
    const threeMinutes = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, durationSeconds: 180 }),
    ).targets;
    const below = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, durationSeconds: 179 }),
    ).targets;
    const fiveMinutes = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, durationSeconds: 300 }),
    ).targets;
    const above = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, durationSeconds: 301 }),
    ).targets;

    expect(targetOf(threeMinutes, 'recommended-duration').pass).toBe(true);
    expect(targetOf(below, 'recommended-duration').pass).toBe(false);
    expect(targetOf(fiveMinutes, 'recommended-duration').pass).toBe(true);
    expect(targetOf(above, 'recommended-duration').pass).toBe(false);
  });

  it('16.3: recommended spends at least 70 % of the collected Essence', () => {
    const level = testLevelAt(5);
    const passing = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, essenceSpent: 70, essenceAvailable: 100 }),
    ).targets;
    const failing = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, essenceSpent: 69, essenceAvailable: 100 }),
    ).targets;

    expect(targetOf(passing, 'recommended-essence-spent').pass).toBe(true);
    expect(targetOf(failing, 'recommended-essence-spent').pass).toBe(false);
  });

  it('16.3: the recommended trap fires in fewer than 25 % of wins', () => {
    const level = testLevelAt(5);
    const passing = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, trapWins: 12 }),
    ).targets;
    const failing = buildLevelReport(
      level,
      makeRuns('recommended', { total: 50, wins: 50, trapWins: 13 }),
    ).targets;

    expect(targetOf(passing, 'recommended-trap-usage').pass).toBe(true);
    expect(targetOf(failing, 'recommended-trap-usage').pass).toBe(false);
  });
});

describe('16.3 whale target', () => {
  it('16.3: whale time must be at least 70 % of the recommended time', () => {
    const level = testLevelAt(5);
    const recommended = makeRuns('recommended', { total: 50, wins: 50, durationSeconds: 200 });
    const exactlySeventy = buildLevelReport(level, [
      ...recommended,
      ...makeRuns('whale', { total: 50, wins: 50, durationSeconds: 140 }),
    ]).targets;
    const belowSeventy = buildLevelReport(level, [
      ...makeRuns('recommended', { total: 50, wins: 50, durationSeconds: 200 }),
      ...makeRuns('whale', { total: 50, wins: 50, durationSeconds: 139 }),
    ]).targets;

    expect(targetOf(exactlySeventy, 'whale-time-vs-recommended').pass).toBe(true);
    expect(targetOf(belowSeventy, 'whale-time-vs-recommended').pass).toBe(false);
  });
});

describe('16.4 report formatting', () => {
  it('16.4: bot metrics aggregate wins, stars, Essence and traps', () => {
    const metrics = buildBotMetrics(
      'recommended',
      makeRuns('recommended', { total: 4, wins: 3, threeStar: 2, trapWins: 1, placed: ['a'] }),
    );

    expect(metrics.runs).toBe(4);
    expect(metrics.wins).toBe(3);
    expect(metrics.winRate).toBeCloseTo(0.75);
    expect(metrics.threeStarRate).toBeCloseTo(0.5);
    expect(metrics.trapRate).toBeCloseTo(1 / 3);
    expect(metrics.defenderWinCounts).toEqual({ a: 3 });
  });

  it('16.4: the markdown has the fixed columns and ✔/❌ marks', () => {
    const level = testLevelAt(5);
    const runs = makeRuns(
      'recommended',
      { total: 50, wins: 50, threeStar: 25, durationSeconds: 60 },
      level.id,
    );
    const report = buildWorldReport(1, [level], runs, 50);
    const markdown = formatMarkdown(report);

    expect(markdown).toContain(
      '| Level | Bot | Runs | Win % | 3-star % | Avg duration | Avg Essence spent % | Trap % | Worst failing target |',
    );
    expect(markdown).toContain('❌ level duration');
    expect(markdown).toContain('✔');
    expect(markdown).toContain('# World 1 balance report');
  });

  it('16.4: the JSON report carries the same data', () => {
    const level = testLevelAt(5);
    const report = buildWorldReport(
      1,
      [level],
      makeRuns('recommended', { total: 2, wins: 2 }, level.id),
      2,
    );
    const parsed = JSON.parse(formatJson(report)) as {
      world: number;
      runsPerLevel: number;
      levels: { levelId: string; bots: { botId: string }[] }[];
      worldTargets: { id: string }[];
    };

    expect(parsed.world).toBe(1);
    expect(parsed.runsPerLevel).toBe(2);
    expect(parsed.levels[0]?.levelId).toBe('w1_l05');
    expect(parsed.levels[0]?.bots.map((bot) => bot.botId)).toEqual(['recommended']);
    expect(parsed.worldTargets[0]?.id).toBe('card-diversity');
  });

  it('16.4: the worst failing target cell picks the most severe failure', () => {
    const level = testLevelAt(5);
    const runs = makeRuns(
      'recommended',
      { total: 50, wins: 40, durationSeconds: 60, essenceSpent: 10, essenceAvailable: 100 },
      level.id,
    );
    const report = buildWorldReport(1, [level], runs, 50);
    const markdown = formatMarkdown(report);

    expect(markdown).toContain('❌ 3-star rate 0.0% (40.0%-80.0%) (+3 more)');
  });

  it('16.3/#81: fixed-loadout levels count in the raw share but not in the target', () => {
    const level = LevelDef.parse({
      ...createTestLevel(),
      id: 'w1_l04',
      number: 4,
      fixedLoadout: ['sparkbolt_gremlin'],
    });
    const runs = makeRuns(
      'recommended',
      { total: 50, wins: 50, placed: ['sparkbolt_gremlin'] },
      level.id,
    );
    const report = buildWorldReport(1, [level], runs, 50);
    const diversity = report.cardDiversity[0];

    expect(diversity?.wins).toBe(0);
    expect(diversity?.winShare).toBe(0);
    expect(diversity?.allLevelsWins).toBe(50);
    expect(diversity?.allLevelsWinShare).toBe(1);
    expect(report.worldTargets[0]?.pass).toBe(false);
  });

  it('16.3: card diversity fails above 80 % of recommended wins', () => {
    const level = testLevelAt(5);
    const runs = makeRuns(
      'recommended',
      { total: 50, wins: 50, placed: ['sparkbolt_gremlin'] },
      level.id,
    );
    const report = buildWorldReport(1, [level], runs, 50);
    const diversity = report.cardDiversity[0];

    expect(diversity?.defenderId).toBe('sparkbolt_gremlin');
    expect(diversity?.winShare).toBe(1);
    expect(report.worldTargets[0]?.pass).toBe(false);
  });
});
