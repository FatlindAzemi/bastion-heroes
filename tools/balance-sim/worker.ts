/**
 * Worker thread of the balancing bot (spec 16.2): runs one contiguous range of
 * run seeds for one level/bot pair and sends the results back to `run.ts`.
 *
 * The runner starts one worker per CPU and feeds them jobs, so the full
 * 10 levels × 5 bots × 50 runs stay under the two-minute budget.
 */
import { isMainThread, parentPort } from 'node:worker_threads';

import { levelById } from '../../src/data';
import { runBotRuns } from './bots';
import type { WorkerJob, WorkerMessage, WorkerOutcome } from './types';

/** Runs one job against the real sim and the data registry (spec 11.3, 16.2). */
function executeJob(job: WorkerJob): WorkerOutcome {
  const level = levelById[job.levelId];
  if (level === undefined) {
    throw new Error(`unknown level "${job.levelId}"`);
  }
  return {
    levelId: job.levelId,
    botId: job.botId,
    runs: runBotRuns(level, job.botId, job.firstRunSeed, job.runCount),
  };
}

if (!isMainThread && parentPort !== null) {
  const channel = parentPort;
  channel.on('message', (message) => {
    let response: WorkerMessage;
    try {
      response = executeJob(message as WorkerJob);
    } catch (error) {
      response = { error: error instanceof Error ? error.message : String(error) };
    }
    channel.postMessage(response);
  });
}
