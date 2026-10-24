/**
 * The balancing-bot report of spec 16.3 and 16.4: aggregates the run results,
 * evaluates every target with a ✔/❌ mark and formats `balance-report/<world>.md`
 * and `balance-report/<world>.json`.
 *
 * This module is pure: it never touches Node APIs, so the target evaluation and
 * the markdown format are unit-testable (spec 16.1 balance layer).
 */
import { defenderById, rules } from '../../src/data';
import type { LevelDef } from '../../src/data';
import { BOT_IDS } from './types';
import type {
  BotId,
  BotMetrics,
  CardDiversityRow,
  LevelReport,
  RunResult,
  TargetEvaluation,
  WorldReport,
} from './types';

/** Idle must win nothing after the tutorial (spec 16.3). */
const IDLE_ALLOWED_LEVEL = { world: 1, number: 1 };

/** Random wins at most 30 % from L04 on (spec 16.3). */
const RANDOM_WIN_RATE_LIMIT = 0.3;
const RANDOM_TARGET_FROM_LEVEL_NUMBER = 4;

/** Commons win at least 90 % on L01-L05 and 70 % on L06-L10 (spec 16.3). */
const COMMONS_EARLY_LEVELS = 5;
const COMMONS_EARLY_WIN_RATE = 0.9;
const COMMONS_LATE_WIN_RATE = 0.7;

/** Recommended wins at least 95 %, 3-star 40-80 % (spec 16.3). */
const RECOMMENDED_WIN_RATE = 0.95;
const RECOMMENDED_THREE_STAR_MIN = 0.4;
const RECOMMENDED_THREE_STAR_MAX = 0.8;

/** A recommended level lasts 3:00-5:00 minutes, final wave included (spec 16.3). */
const RECOMMENDED_DURATION_MIN_SECONDS = 180;
const RECOMMENDED_DURATION_MAX_SECONDS = 300;

/** Recommended spends at least 70 % of the Essence it collects (spec 16.3). */
const RECOMMENDED_ESSENCE_SPENT_MIN = 0.7;

/** The recommended trap fires in fewer than 25 % of wins (spec 16.3). */
const RECOMMENDED_TRAP_RATE_LIMIT = 0.25;

/** Whale time is at least 70 % of the recommended time (spec 16.3). */
const WHALE_TIME_RATIO_MIN = 0.7;

/** No non-producer card appears in more than 80 % of recommended wins (spec 16.3). */
const CARD_DIVERSITY_LIMIT = 0.8;

/** Formats a 0..1 ratio as a percentage with one decimal, e.g. `92.0%`. */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Formats seconds as `m:ss`, e.g. `3:05`. */
export function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Builds the metrics of one bot from its run results (spec 16.3/16.4). */
export function buildBotMetrics(botId: BotId, runs: readonly RunResult[]): BotMetrics {
  const wins = runs.filter((run) => run.status === 'won');
  const threeStarWins = wins.filter((run) => run.stars === 3);
  const defenderWinCounts: Record<string, number> = {};
  for (const win of wins) {
    for (const defenderId of win.placedDefenderIds) {
      defenderWinCounts[defenderId] = (defenderWinCounts[defenderId] ?? 0) + 1;
    }
  }
  const totalDurationTicks = runs.reduce((sum, run) => sum + run.durationTicks, 0);
  const totalEssenceSpent = runs.reduce((sum, run) => sum + run.essenceSpent, 0);
  const totalEssenceAvailable = runs.reduce((sum, run) => sum + run.essenceAvailable, 0);
  const trapWins = wins.filter((run) => run.trapUsed).length;
  return {
    botId,
    runs: runs.length,
    wins: wins.length,
    winRate: runs.length === 0 ? 0 : wins.length / runs.length,
    threeStarRate: runs.length === 0 ? 0 : threeStarWins.length / runs.length,
    averageDurationSeconds:
      runs.length === 0 ? 0 : totalDurationTicks / runs.length / rules.tick.tickRate,
    averageEssenceSpentRatio:
      totalEssenceAvailable === 0 ? 0 : totalEssenceSpent / totalEssenceAvailable,
    trapRate: wins.length === 0 ? 0 : trapWins / wins.length,
    timedOut: runs.filter((run) => run.timedOut).length,
    defenderWinCounts,
  };
}

/** True when the level is the W1-L01 tutorial, the only level without an idle target (spec 16.3). */
function isTutorialLevel(level: LevelDef): boolean {
  return level.world === IDLE_ALLOWED_LEVEL.world && level.number === IDLE_ALLOWED_LEVEL.number;
}

/** True when the measured value is at least the minimum. */
function atLeast(value: number, minimum: number): boolean {
  return value >= minimum;
}

/** True when the measured value is at most the maximum. */
function atMost(value: number, maximum: number): boolean {
  return value <= maximum;
}

/** Relative distance below a minimum, 0 when it passes. */
function belowSeverity(value: number, minimum: number): number {
  return atLeast(value, minimum) ? 0 : (minimum - value) / minimum;
}

/** Relative distance above a maximum, 0 when it passes. */
function aboveSeverity(value: number, maximum: number): number {
  return atMost(value, maximum) ? 0 : (value - maximum) / maximum;
}

/** Relative distance outside a range, 0 when it passes. */
function rangeSeverity(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return belowSeverity(value, minimum);
  }
  return aboveSeverity(value, maximum);
}

/** Builds one level target evaluation. */
function levelTarget(
  id: string,
  label: string,
  level: LevelDef,
  botId: BotId,
  value: string,
  requirement: string,
  pass: boolean,
  severity: number,
): TargetEvaluation {
  return {
    id,
    label,
    scope: 'level',
    levelId: level.id,
    botId,
    value,
    requirement,
    pass,
    severity,
  };
}

/** The idle target: 0 % wins on every level except W1-L01 (spec 16.3). */
function evaluateIdle(
  level: LevelDef,
  metrics: BotMetrics | undefined,
): TargetEvaluation | undefined {
  if (metrics === undefined || isTutorialLevel(level)) {
    return undefined;
  }
  const pass = metrics.winRate === 0;
  return levelTarget(
    'idle-win-rate',
    'idle wins',
    level,
    'idle',
    formatPercent(metrics.winRate),
    '= 0.0%',
    pass,
    pass ? 0 : metrics.winRate,
  );
}

/** The random target: at most 30 % from L04 on (spec 16.3). */
function evaluateRandom(
  level: LevelDef,
  metrics: BotMetrics | undefined,
): TargetEvaluation | undefined {
  if (metrics === undefined || level.number < RANDOM_TARGET_FROM_LEVEL_NUMBER) {
    return undefined;
  }
  return levelTarget(
    'random-win-rate',
    'win rate',
    level,
    'random',
    formatPercent(metrics.winRate),
    `≤ ${formatPercent(RANDOM_WIN_RATE_LIMIT)}`,
    atMost(metrics.winRate, RANDOM_WIN_RATE_LIMIT),
    aboveSeverity(metrics.winRate, RANDOM_WIN_RATE_LIMIT),
  );
}

/** The commons target: 90 % on L01-L05, 70 % on L06-L10 (spec 16.3). */
function evaluateCommons(
  level: LevelDef,
  metrics: BotMetrics | undefined,
): TargetEvaluation | undefined {
  if (metrics === undefined) {
    return undefined;
  }
  const minimum =
    level.number <= COMMONS_EARLY_LEVELS ? COMMONS_EARLY_WIN_RATE : COMMONS_LATE_WIN_RATE;
  return levelTarget(
    'commons-win-rate',
    'win rate',
    level,
    'commons',
    formatPercent(metrics.winRate),
    `≥ ${formatPercent(minimum)}`,
    atLeast(metrics.winRate, minimum),
    belowSeverity(metrics.winRate, minimum),
  );
}

/** The recommended win and 3-star targets (spec 16.3). */
function evaluateRecommendedWins(level: LevelDef, metrics: BotMetrics): TargetEvaluation[] {
  return [
    levelTarget(
      'recommended-win-rate',
      'win rate',
      level,
      'recommended',
      formatPercent(metrics.winRate),
      `≥ ${formatPercent(RECOMMENDED_WIN_RATE)}`,
      atLeast(metrics.winRate, RECOMMENDED_WIN_RATE),
      belowSeverity(metrics.winRate, RECOMMENDED_WIN_RATE),
    ),
    levelTarget(
      'recommended-three-star-rate',
      '3-star rate',
      level,
      'recommended',
      formatPercent(metrics.threeStarRate),
      `${formatPercent(RECOMMENDED_THREE_STAR_MIN)}-${formatPercent(RECOMMENDED_THREE_STAR_MAX)}`,
      atLeast(metrics.threeStarRate, RECOMMENDED_THREE_STAR_MIN) &&
        atMost(metrics.threeStarRate, RECOMMENDED_THREE_STAR_MAX),
      rangeSeverity(metrics.threeStarRate, RECOMMENDED_THREE_STAR_MIN, RECOMMENDED_THREE_STAR_MAX),
    ),
  ];
}

/** The recommended duration target (spec 16.3). */
function evaluateRecommendedDuration(level: LevelDef, metrics: BotMetrics): TargetEvaluation {
  return levelTarget(
    'recommended-duration',
    'level duration',
    level,
    'recommended',
    formatDuration(metrics.averageDurationSeconds),
    `${formatDuration(RECOMMENDED_DURATION_MIN_SECONDS)}-${formatDuration(
      RECOMMENDED_DURATION_MAX_SECONDS,
    )}`,
    atLeast(metrics.averageDurationSeconds, RECOMMENDED_DURATION_MIN_SECONDS) &&
      atMost(metrics.averageDurationSeconds, RECOMMENDED_DURATION_MAX_SECONDS),
    rangeSeverity(
      metrics.averageDurationSeconds,
      RECOMMENDED_DURATION_MIN_SECONDS,
      RECOMMENDED_DURATION_MAX_SECONDS,
    ),
  );
}

/** The recommended Essence and trap targets (spec 16.3). */
function evaluateRecommendedEconomy(level: LevelDef, metrics: BotMetrics): TargetEvaluation[] {
  return [
    levelTarget(
      'recommended-essence-spent',
      'Essence spent',
      level,
      'recommended',
      formatPercent(metrics.averageEssenceSpentRatio),
      `≥ ${formatPercent(RECOMMENDED_ESSENCE_SPENT_MIN)}`,
      atLeast(metrics.averageEssenceSpentRatio, RECOMMENDED_ESSENCE_SPENT_MIN),
      belowSeverity(metrics.averageEssenceSpentRatio, RECOMMENDED_ESSENCE_SPENT_MIN),
    ),
    levelTarget(
      'recommended-trap-usage',
      'trap usage',
      level,
      'recommended',
      formatPercent(metrics.trapRate),
      `< ${formatPercent(RECOMMENDED_TRAP_RATE_LIMIT)}`,
      metrics.trapRate < RECOMMENDED_TRAP_RATE_LIMIT,
      aboveSeverity(metrics.trapRate, RECOMMENDED_TRAP_RATE_LIMIT),
    ),
  ];
}

/** The recommended targets: win, stars, duration, Essence and trap usage (spec 16.3). */
function evaluateRecommended(level: LevelDef, metrics: BotMetrics | undefined): TargetEvaluation[] {
  if (metrics === undefined) {
    return [];
  }
  return [
    ...evaluateRecommendedWins(level, metrics),
    evaluateRecommendedDuration(level, metrics),
    ...evaluateRecommendedEconomy(level, metrics),
  ];
}

/** The whale target: its average time is at least 70 % of the recommended average (spec 16.3). */
function evaluateWhale(
  level: LevelDef,
  whale: BotMetrics | undefined,
  recommended: BotMetrics | undefined,
): TargetEvaluation | undefined {
  if (whale === undefined || recommended === undefined || recommended.averageDurationSeconds <= 0) {
    return undefined;
  }
  const ratio = whale.averageDurationSeconds / recommended.averageDurationSeconds;
  return levelTarget(
    'whale-time-vs-recommended',
    'average level time',
    level,
    'whale',
    formatPercent(ratio),
    `≥ ${formatPercent(WHALE_TIME_RATIO_MIN)} of recommended`,
    atLeast(ratio, WHALE_TIME_RATIO_MIN),
    belowSeverity(ratio, WHALE_TIME_RATIO_MIN),
  );
}

/** Evaluates every level target of one level (spec 16.3). */
function evaluateLevelTargets(level: LevelDef, bots: readonly BotMetrics[]): TargetEvaluation[] {
  const byBot = new Map<BotId, BotMetrics>(bots.map((metrics) => [metrics.botId, metrics]));
  const targets: TargetEvaluation[] = [];
  const idle = evaluateIdle(level, byBot.get('idle'));
  if (idle !== undefined) {
    targets.push(idle);
  }
  const random = evaluateRandom(level, byBot.get('random'));
  if (random !== undefined) {
    targets.push(random);
  }
  const commons = evaluateCommons(level, byBot.get('commons'));
  if (commons !== undefined) {
    targets.push(commons);
  }
  targets.push(...evaluateRecommended(level, byBot.get('recommended')));
  const whale = evaluateWhale(level, byBot.get('whale'), byBot.get('recommended'));
  if (whale !== undefined) {
    targets.push(whale);
  }
  return targets;
}

/** Builds the report data of one level: one metrics row per bot plus its evaluated targets. */
export function buildLevelReport(level: LevelDef, runs: readonly RunResult[]): LevelReport {
  const bots = BOT_IDS.map((botId) =>
    buildBotMetrics(
      botId,
      runs.filter((run) => run.botId === botId),
    ),
  ).filter((metrics) => metrics.runs > 0);
  return {
    levelId: level.id,
    levelName: level.name,
    world: level.world,
    number: level.number,
    freeLoadout: level.fixedLoadout === null,
    bots,
    targets: evaluateLevelTargets(level, bots),
  };
}

/** Sums the defender win counts and the winning runs of a set of levels. */
function sumRecommendedWins(levels: readonly LevelReport[]): {
  totalWins: number;
  winCounts: Map<string, number>;
} {
  const winCounts = new Map<string, number>();
  let totalWins = 0;
  for (const level of levels) {
    const recommended = level.bots.find((metrics) => metrics.botId === 'recommended');
    if (recommended === undefined) {
      continue;
    }
    totalWins += recommended.wins;
    for (const [defenderId, wins] of Object.entries(recommended.defenderWinCounts)) {
      winCounts.set(defenderId, (winCounts.get(defenderId) ?? 0) + wins);
    }
  }
  return { totalWins, winCounts };
}

/**
 * Builds the world card-diversity rows (spec 16.3, decision #81 option A): the
 * target share counts only free-loadout levels (W1-L05-L10), while the raw
 * all-level share is kept next to it so the fixed tutorial loadouts stay visible.
 */
function buildCardDiversity(levels: readonly LevelReport[]): CardDiversityRow[] {
  const free = sumRecommendedWins(levels.filter((level) => level.freeLoadout));
  const all = sumRecommendedWins(levels);
  const defenderIds = new Set<string>([...free.winCounts.keys(), ...all.winCounts.keys()]);
  const rows: CardDiversityRow[] = [];
  for (const defenderId of defenderIds) {
    const defenderDef = defenderById[defenderId];
    const wins = free.winCounts.get(defenderId) ?? 0;
    const allLevelsWins = all.winCounts.get(defenderId) ?? 0;
    const winShare = free.totalWins === 0 ? 0 : wins / free.totalWins;
    rows.push({
      defenderId,
      name: defenderDef?.name ?? defenderId,
      role: defenderDef?.role ?? 'unknown',
      wins,
      winShare,
      allLevelsWins,
      allLevelsWinShare: all.totalWins === 0 ? 0 : allLevelsWins / all.totalWins,
      exempt: defenderDef?.role === 'producer',
      pass:
        defenderDef?.role === 'producer' ||
        (free.totalWins > 0 && atMost(winShare, CARD_DIVERSITY_LIMIT)),
    });
  }
  return rows.sort(
    (first, second) => second.winShare - first.winShare || first.name.localeCompare(second.name),
  );
}

/** The world-level card-diversity target (spec 16.3). */
function evaluateCardDiversity(
  rows: readonly CardDiversityRow[],
  totalWins: number,
): TargetEvaluation {
  const evaluated = rows.filter((row) => !row.exempt && row.wins > 0);
  if (totalWins === 0) {
    return {
      id: 'card-diversity',
      label: 'card diversity',
      scope: 'world',
      levelId: null,
      botId: 'recommended',
      value: 'no free-loadout wins',
      requirement: `≤ ${formatPercent(CARD_DIVERSITY_LIMIT)} per non-producer`,
      pass: false,
      severity: 1,
    };
  }
  const worst = evaluated.reduce<CardDiversityRow | undefined>(
    (current, candidate) =>
      current === undefined || candidate.winShare > current.winShare ? candidate : current,
    undefined,
  );
  const winShare = worst?.winShare ?? 0;
  return {
    id: 'card-diversity',
    label: 'card diversity',
    scope: 'world',
    levelId: null,
    botId: 'recommended',
    value: worst === undefined ? 'no cards' : `${worst.name} ${formatPercent(winShare)}`,
    requirement: `≤ ${formatPercent(CARD_DIVERSITY_LIMIT)} per non-producer`,
    pass: evaluated.every((row) => row.pass),
    severity: aboveSeverity(winShare, CARD_DIVERSITY_LIMIT),
  };
}

/** Counts the recommended wins on free-loadout levels for the diversity target (spec 16.3). */
function recommendedWins(levels: readonly LevelReport[]): number {
  return levels.reduce((sum, level) => {
    if (!level.freeLoadout) {
      return sum;
    }
    const recommended = level.bots.find((metrics) => metrics.botId === 'recommended');
    return sum + (recommended?.wins ?? 0);
  }, 0);
}

/** Builds the whole world report (spec 16.4): levels, bot summary, targets and diversity. */
export function buildWorldReport(
  world: number,
  levelDefs: readonly LevelDef[],
  runs: readonly RunResult[],
  runsPerLevel: number,
): WorldReport {
  // Worker threads finish in any order: order the runs before aggregating so the
  // floating-point sums and the JSON key order are identical on every machine.
  const orderedRuns = [...runs].sort(
    (first, second) =>
      first.levelId.localeCompare(second.levelId) ||
      first.botId.localeCompare(second.botId) ||
      first.runSeed - second.runSeed,
  );
  const levels = levelDefs
    .filter((level) => level.world === world)
    .sort((first, second) => first.number - second.number)
    .map((level) =>
      buildLevelReport(
        level,
        orderedRuns.filter((run) => run.levelId === level.id),
      ),
    );
  const cardDiversity = buildCardDiversity(levels);
  const botSummary = BOT_IDS.map((botId) =>
    buildBotMetrics(
      botId,
      orderedRuns.filter((run) => run.botId === botId),
    ),
  ).filter((metrics) => metrics.runs > 0);
  return {
    world,
    runsPerLevel,
    levels,
    botSummary,
    worldTargets: [evaluateCardDiversity(cardDiversity, recommendedWins(levels))],
    cardDiversity,
  };
}

/** The fails of one report row; ✔ when every target passes and — when none applies. */
function worstFailingTarget(
  targets: readonly TargetEvaluation[],
  botId: BotId,
): { mark: string; severity: number } {
  const forBot = targets.filter((target) => target.botId === botId);
  if (forBot.length === 0) {
    return { mark: '—', severity: 0 };
  }
  const failures = forBot.filter((target) => !target.pass);
  if (failures.length === 0) {
    return { mark: '✔', severity: 0 };
  }
  const worst = failures.reduce((current, candidate) =>
    candidate.severity > current.severity ? candidate : current,
  );
  const more = failures.length > 1 ? ` (+${failures.length - 1} more)` : '';
  return {
    mark: `❌ ${worst.label} ${worst.value} (${worst.requirement})${more}`,
    severity: worst.severity,
  };
}

/** The level label of a report row, e.g. `W1-L05 Shield Wall`. */
function levelLabel(level: LevelReport): string {
  return `W${level.world}-L${String(level.number).padStart(2, '0')} ${level.levelName}`;
}

/** The 16.4 results table: one row per level and bot. */
function resultsTable(report: WorldReport): string[] {
  const lines = [
    '| Level | Bot | Runs | Win % | 3-star % | Avg duration | Avg Essence spent % | Trap % | Worst failing target |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const level of report.levels) {
    for (const metrics of level.bots) {
      const worst = worstFailingTarget(level.targets, metrics.botId);
      lines.push(
        `| ${levelLabel(level)} | ${metrics.botId} | ${metrics.runs} | ${formatPercent(
          metrics.winRate,
        )} | ${formatPercent(metrics.threeStarRate)} | ${formatDuration(
          metrics.averageDurationSeconds,
        )} | ${formatPercent(metrics.averageEssenceSpentRatio)} | ${formatPercent(
          metrics.trapRate,
        )} | ${worst.mark} |`,
      );
    }
  }
  return lines;
}

/** The bot summary table (world-wide aggregation of the same metrics). */
function botSummaryTable(report: WorldReport): string[] {
  const lines = [
    '| Bot | Runs | Win % | 3-star % | Avg duration | Avg Essence spent % | Trap % |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const metrics of report.botSummary) {
    lines.push(
      `| ${metrics.botId} | ${metrics.runs} | ${formatPercent(metrics.winRate)} | ${formatPercent(
        metrics.threeStarRate,
      )} | ${formatDuration(metrics.averageDurationSeconds)} | ${formatPercent(
        metrics.averageEssenceSpentRatio,
      )} | ${formatPercent(metrics.trapRate)} |`,
    );
  }
  return lines;
}

/** The world-target table with ✔/❌ marks (spec 16.3). */
function worldTargetTable(report: WorldReport): string[] {
  const lines = ['| Target | Value | Requirement | Result |', '| --- | --- | --- | --- |'];
  for (const target of report.worldTargets) {
    lines.push(
      `| ${target.label} | ${target.value} | ${target.requirement} | ${target.pass ? '✔' : '❌'} |`,
    );
  }
  return lines;
}

/** The card-diversity table of the world (spec 16.3, decision #81 option A). */
function cardDiversityTable(report: WorldReport): string[] {
  const freeWins = report.levels
    .filter((level) => level.freeLoadout)
    .reduce(
      (sum, level) =>
        sum + (level.bots.find((metrics) => metrics.botId === 'recommended')?.wins ?? 0),
      0,
    );
  const lines = [
    'The 16.3 target counts only free-loadout levels (W1-L05-L10, decision #81 option A); the all-level share is unchanged raw information.',
    '',
    `| Defender | Role | Free-level wins | Share of ${freeWins} free-level wins (target) | All-level share (info) | Result |`,
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.cardDiversity) {
    const result = row.exempt ? 'exempt (producer)' : row.pass ? '✔' : '❌';
    lines.push(
      `| ${row.name} | ${row.role} | ${row.wins} | ${formatPercent(row.winShare)} | ` +
        `${formatPercent(row.allLevelsWinShare)} | ${result} |`,
    );
  }
  return lines;
}

/** Formats the markdown report of spec 16.4. */
export function formatMarkdown(report: WorldReport): string {
  const lines = [
    `# World ${report.world} balance report`,
    '',
    `\`npm run balance -- --world ${report.world} --runs ${report.runsPerLevel}\`: ` +
      `every level is played ${report.runsPerLevel} times per bot with the real sim (spec 16.2).`,
    '',
    'The level seed stays fixed per level (spec 7.2); the run seed varies the bot decisions (spec 16.2).',
    'A row marked ❌ misses at least one target of spec 16.3; ✔ means all targets pass.',
    'Avg Essence spent % is the spent Essence divided by the starting Essence plus collected orbs; trap % is the share of wins that used a Last Stand Trap.',
    '',
    '## Results',
    '',
    ...resultsTable(report),
    '',
    '## World targets',
    '',
    ...worldTargetTable(report),
    '',
    '## Card diversity',
    '',
    ...cardDiversityTable(report),
    '',
    '## Bot summary',
    '',
    ...botSummaryTable(report),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

/** Formats the JSON report of spec 16.4. */
export function formatJson(report: WorldReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
