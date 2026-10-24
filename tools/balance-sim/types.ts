/**
 * Shared types of the balancing bot (spec 16.2-16.4). This module is pure: the
 * runner and the worker use it, and the report unit tests build these values
 * without touching Node APIs.
 */

/** The five bot variants of spec 16.2, in report order. */
export const BOT_IDS = ['idle', 'random', 'commons', 'recommended', 'whale'] as const;

/** One bot variant of spec 16.2. */
export type BotId = (typeof BOT_IDS)[number];

/** The result of one bot run: everything the 16.3 targets and 16.4 report need. */
export interface RunResult {
  levelId: string;
  botId: BotId;
  /** Seed of the bot's own tie-breaks and random choices; the level seed stays fixed (spec 16.2). */
  runSeed: number;
  status: 'won' | 'lost';
  stars: 0 | 1 | 2 | 3;
  /** Ticks the level ran; 1 tick = 1/30 s (spec 3.2). */
  durationTicks: number;
  /** Essence actually spent on placements and merges. */
  essenceSpent: number;
  /** Essence available: the level's starting Essence plus every collected orb (spec 16.3). */
  essenceAvailable: number;
  /** True when any Last Stand Trap fired (spec 3.9, 3.11). */
  trapUsed: boolean;
  /** Unique defender ids placed at least once during the run, in first-placement order. */
  placedDefenderIds: string[];
  /** True when the safety cap ended the run instead of a win or loss (never a 16.3 target result). */
  timedOut: boolean;
}

/** Aggregated metrics of one bot on one level (16.3/16.4). */
export interface BotMetrics {
  botId: BotId;
  runs: number;
  wins: number;
  /** Wins divided by runs, 0..1. */
  winRate: number;
  /** 3-star wins divided by runs, 0..1. */
  threeStarRate: number;
  /** Average level duration in seconds over all runs. */
  averageDurationSeconds: number;
  /** Average of `essenceSpent / essenceAvailable` over all runs, 0..1. */
  averageEssenceSpentRatio: number;
  /** Runs with a used trap divided by wins; 0 when the bot won nothing (spec 16.3). */
  trapRate: number;
  /** Runs the safety cap ended instead of the level result (never a 16.3 target result). */
  timedOut: number;
  /** Defender id -> number of won runs in which it was placed (card diversity, spec 16.3). */
  defenderWinCounts: Record<string, number>;
}

/** One evaluated 16.3 target, shown as pass/fail with the measured value. */
export interface TargetEvaluation {
  /** Stable id used by the JSON report, e.g. `recommended-win-rate`. */
  id: string;
  /** Short human-readable name, e.g. `win rate`. */
  label: string;
  scope: 'level' | 'world';
  /** Level the target was evaluated for, or null for a world target. */
  levelId: string | null;
  /** Bot the target was evaluated for, or null for a world target. */
  botId: BotId | null;
  /** Formatted measured value, e.g. `92.0%`. */
  value: string;
  /** Formatted requirement, e.g. `≥ 95.0%`. */
  requirement: string;
  pass: boolean;
  /** Relative distance from the target, 0 when it passes; used to pick the worst failing target. */
  severity: number;
}

/** The report row data of one level: one entry per bot plus the evaluated level targets. */
export interface LevelReport {
  levelId: string;
  levelName: string;
  world: number;
  number: number;
  /** True on levels without a fixed loadout (W1-L05-L10), where the player picks the cards. */
  freeLoadout: boolean;
  bots: BotMetrics[];
  targets: TargetEvaluation[];
}

/** One row of the world card-diversity table (spec 16.3: no non-producer above 80 %). */
export interface CardDiversityRow {
  defenderId: string;
  name: string;
  role: string;
  /**
   * Won recommended runs on FREE-loadout levels in which the defender was placed.
   * Fixed tutorial levels are excluded from the target, per decision #81 option A.
   */
  wins: number;
  /** `wins / recommended wins on free-loadout levels`, 0..1; the 16.3 target value. */
  winShare: number;
  /** Won recommended runs on ALL levels in which the defender was placed (raw info). */
  allLevelsWins: number;
  /** `allLevelsWins / all recommended wins`, 0..1; shown next to the target value. */
  allLevelsWinShare: number;
  /** True when the role is a producer; those are exempt from the 16.3 target. */
  exempt: boolean;
  pass: boolean;
}

/** The machine-readable report of one world (spec 16.4). */
export interface WorldReport {
  world: number;
  runsPerLevel: number;
  levels: LevelReport[];
  botSummary: BotMetrics[];
  worldTargets: TargetEvaluation[];
  cardDiversity: CardDiversityRow[];
}

/** One work unit of the worker pool: a contiguous run-seed range of one level/bot pair. */
export interface WorkerJob {
  levelId: string;
  botId: BotId;
  /** `runSeed` of the first run of the range. */
  firstRunSeed: number;
  runCount: number;
}

/** A worker's answer for one job. */
export interface WorkerOutcome {
  levelId: string;
  botId: BotId;
  runs: RunResult[];
}

/** Anything a worker can send back: a result or a serialised error. */
export type WorkerMessage = WorkerOutcome | { error: string };
