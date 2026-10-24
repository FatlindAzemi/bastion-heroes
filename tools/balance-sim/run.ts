/**
 * `npm run balance -- --world <n> [--level <id>] [--runs 50]` (spec 10.3, 16.2).
 *
 * Plays every level of a world with the five bot variants in worker threads,
 * writes `balance-report/<world>.md` and `balance-report/<world>.json` (spec
 * 16.4) and prints the wall time. Node APIs are typed by `tools/node-shims.d.ts`
 * (decision #58); no dependency is added for them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import { levels } from '../../src/data';
import { buildWorldReport, formatJson, formatMarkdown } from './report';
import { BOT_IDS } from './types';
import type { RunResult, WorkerJob, WorkerMessage, WorldReport } from './types';

/** Runs per worker job; small batches balance the short tutorial and the long boss level. */
const RUNS_PER_JOB = 5;

/** Default of `--runs` (spec 16.2). */
const DEFAULT_RUNS = 50;

/** Fallback worker count when the runtime exposes no hardware concurrency. */
const FALLBACK_WORKER_COUNT = 4;

/** Report folder; committed since issue #50 removed the `.gitignore` entry (spec 16.4). */
const REPORT_DIRECTORY = 'balance-report';

/** Options of one bot invocation. */
interface CliOptions {
  world: number;
  levelId: string | null;
  runs: number;
}

/** Parses a positive integer CLI value. */
function parsePositiveInteger(text: string | undefined, name: string): number {
  const value = text === undefined ? Number.NaN : Number.parseInt(text, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} needs a positive integer, got "${text ?? ''}"`);
  }
  return value;
}

/** Parses the CLI arguments of spec 16.2. */
function parseArguments(argv: readonly string[]): CliOptions {
  let world: number | undefined;
  let levelId: string | null = null;
  let runs = DEFAULT_RUNS;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--world') {
      world = parsePositiveInteger(argv[index + 1], '--world');
      index += 1;
    } else if (argument === '--level') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error('--level needs a level id');
      }
      levelId = value;
      index += 1;
    } else if (argument === '--runs') {
      runs = parsePositiveInteger(argv[index + 1], '--runs');
      index += 1;
    } else {
      throw new Error(`unknown argument "${argument ?? ''}"`);
    }
  }
  if (world === undefined) {
    throw new Error('missing --world <n>');
  }
  return { world, levelId, runs };
}

/** Worker threads to use: one per CPU, at most one per job. */
function workerCount(jobCount: number): number {
  const concurrency = typeof navigator === 'undefined' ? 0 : navigator.hardwareConcurrency;
  const cpuCount = concurrency > 0 ? concurrency : FALLBACK_WORKER_COUNT;
  return Math.max(1, Math.min(cpuCount, jobCount));
}

/** Splits the run grid into contiguous run-seed chunks for the workers (spec 16.2). */
function buildJobs(levelIds: readonly string[], runs: number): WorkerJob[] {
  const jobs: WorkerJob[] = [];
  for (const levelId of levelIds) {
    for (const botId of BOT_IDS) {
      for (let firstRunSeed = 0; firstRunSeed < runs; firstRunSeed += RUNS_PER_JOB) {
        jobs.push({
          levelId,
          botId,
          firstRunSeed,
          runCount: Math.min(RUNS_PER_JOB, runs - firstRunSeed),
        });
      }
    }
  }
  return jobs;
}

/** Mutable bookkeeping of the worker pool of one bot invocation. */
interface WorkerPoolState {
  results: RunResult[];
  nextJobIndex: number;
  workers: Worker[];
}

/** Drains jobs from the shared queue on one worker until no job is left (spec 16.2). */
function runWorkerLane(jobs: readonly WorkerJob[], state: WorkerPoolState): Promise<void> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url));
  state.workers.push(worker);
  return new Promise((resolvePromise, rejectPromise) => {
    const assignNext = (): void => {
      const job = jobs[state.nextJobIndex];
      state.nextJobIndex += 1;
      if (job === undefined) {
        void worker.terminate();
        resolvePromise();
        return;
      }
      worker.postMessage(job);
    };
    worker.on('message', (message) => {
      const response = message as WorkerMessage;
      if ('error' in response) {
        rejectPromise(new Error(`worker: ${response.error}`));
        return;
      }
      state.results.push(...response.runs);
      assignNext();
    });
    worker.on('error', (error) => rejectPromise(error));
    assignNext();
  });
}

/** Runs all jobs on a fixed pool of workers and resolves with every run result. */
async function runJobs(jobs: readonly WorkerJob[], poolSize: number): Promise<RunResult[]> {
  const state: WorkerPoolState = { results: [], nextJobIndex: 0, workers: [] };
  try {
    await Promise.all(Array.from({ length: poolSize }, () => runWorkerLane(jobs, state)));
  } finally {
    for (const worker of state.workers) {
      void worker.terminate();
    }
  }
  return state.results;
}

/** Writes the markdown and JSON report of spec 16.4 and returns their paths. */
function writeReport(report: WorldReport): { markdownPath: string; jsonPath: string } {
  const directory = resolve(process.cwd(), REPORT_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const markdownPath = join(directory, `${report.world}.md`);
  const jsonPath = join(directory, `${report.world}.json`);
  writeFileSync(markdownPath, formatMarkdown(report), 'utf8');
  writeFileSync(jsonPath, formatJson(report), 'utf8');
  return { markdownPath, jsonPath };
}

/** Counts the failing targets of the report for the console summary. */
function failingTargetCount(report: WorldReport): number {
  const levelFails = report.levels.reduce(
    (sum, level) => sum + level.targets.filter((target) => !target.pass).length,
    0,
  );
  return levelFails + report.worldTargets.filter((target) => !target.pass).length;
}

/** Runs one balancing-bot invocation and prints the spec 16.4 summary. */
async function main(): Promise<void> {
  const options = parseArguments(process.argv);
  const worldLevels = levels
    .filter((level) => level.world === options.world)
    .sort((first, second) => first.number - second.number);
  if (worldLevels.length === 0) {
    throw new Error(`no levels for world ${options.world}`);
  }
  const selectedLevels =
    options.levelId === null
      ? worldLevels
      : worldLevels.filter((level) => level.id === options.levelId);
  if (selectedLevels.length === 0) {
    throw new Error(`level "${options.levelId ?? ''}" is not in world ${options.world}`);
  }

  const jobs = buildJobs(
    selectedLevels.map((level) => level.id),
    options.runs,
  );
  const poolSize = workerCount(jobs.length);
  process.stdout.write(
    `balance: world ${options.world}, ${selectedLevels.length} levels x ${BOT_IDS.length} bots x ` +
      `${options.runs} runs with ${poolSize} worker threads\n`,
  );

  const startedAt = performance.now();
  const runs = await runJobs(jobs, poolSize);
  const report = buildWorldReport(options.world, selectedLevels, runs, options.runs);
  const paths = writeReport(report);
  const wallTimeMs = performance.now() - startedAt;

  const failedTargets = failingTargetCount(report);
  process.stdout.write(
    `balance: wall time ${(wallTimeMs / 1000).toFixed(1)} s\n` +
      `balance: wrote ${paths.markdownPath}\n` +
      `balance: wrote ${paths.jsonPath}\n` +
      `balance: ${failedTargets === 0 ? 'all targets met' : `${failedTargets} targets failed`}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`balance: ${message}\n`);
  process.exitCode = 1;
});
