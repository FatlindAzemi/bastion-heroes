import { levelById } from '../../../src/data';
import type { LevelDef } from '../../../src/data';
import { createSim } from '../../../src/sim/createSim';
import { hashState } from '../../../src/sim/hash';
import type { Replay, SimState } from '../../../src/sim/types';

/** Ticks between two recorded hashes (spec 11.6: every 300th tick). */
export const HASH_INTERVAL_TICKS = 300;

/** One recorded state hash (spec 11.6). */
export interface RecordedHash {
  tick: number;
  hash: string;
}

/** Result of running a replay to its end tick or to the end of the level (spec 11.6). */
export interface ReplayResult {
  status: SimState['status'];
  stars: SimState['stars'];
  finalTick: number;
  /** Hashes at every 300th tick plus the final (frozen) tick. */
  hashes: RecordedHash[];
}

/** A committed golden replay: the replay data plus the expected result (spec 11.6). */
export interface GoldenReplay extends Replay {
  /** What this replay exercises; shown in the test name and used for regeneration. */
  description: string;
  /** Tick the replay was run to; the level may end earlier. */
  endTick: number;
  expected: ReplayResult;
}

/** Resolves the replay level from the data registry: the single source of truth (spec 11.2). */
export function resolveReplayLevel(replay: Replay): LevelDef {
  const level = levelById[replay.levelId];
  if (level === undefined) {
    throw new Error(`Replay references unknown level "${replay.levelId}"`);
  }
  return level;
}

/**
 * Rejects a replay whose loadout differs from a level's fixed loadout (W1-L01
 * uses `fixedLoadout: ["sparkbolt_gremlin"]`, spec 7.2 row 1). Card levels are
 * kept as recorded so later saves can replay the same cards.
 */
export function validateReplayLoadout(replay: Replay, level: LevelDef): void {
  if (level.fixedLoadout === null) {
    return;
  }
  const replayIds = replay.loadout.map((entry) => entry.defenderId);
  if (JSON.stringify(replayIds) !== JSON.stringify(level.fixedLoadout)) {
    throw new Error(
      `Replay loadout [${replayIds.join(', ')}] does not match the fixed loadout of ${level.id}`,
    );
  }
}

/** Rejects commands whose ticks go backwards or are not whole non-negative ticks (spec 11.6). */
function validateCommandOrder(replay: Replay): void {
  let previousTick = -1;
  for (const command of replay.commands) {
    if (!Number.isInteger(command.tick) || command.tick < 0) {
      throw new Error(`Replay command tick ${command.tick} is not a non-negative integer`);
    }
    if (command.tick < previousTick) {
      throw new Error('Replay commands must be ordered by their tick');
    }
    previousTick = command.tick;
  }
}

/**
 * Runs one replay for at most `endTick` ticks (spec 11.6). Commands are applied
 * in phase 1 of the tick they name: a command with `tick === state.tick` is
 * enqueued right before that tick is stepped. Hashes are recorded after every
 * 300th tick and once more for the final state (the tick freezes after the level
 * ends), so a rule change shows up in the comparison.
 */
export function runReplay(replay: Replay, endTick: number): ReplayResult {
  const level = resolveReplayLevel(replay);
  validateReplayLoadout(replay, level);
  validateCommandOrder(replay);

  const sim = createSim(level, replay.loadout, replay.seed);
  const hashes: RecordedHash[] = [];
  let commandIndex = 0;

  while (sim.state.tick < endTick && sim.state.status === 'playing') {
    while (commandIndex < replay.commands.length) {
      const command = replay.commands[commandIndex];
      if (command === undefined) {
        break;
      }
      if (command.tick > sim.state.tick) {
        break;
      }
      if (command.tick === sim.state.tick) {
        sim.enqueue(command.cmd);
      }
      commandIndex += 1;
    }
    sim.step();
    if (sim.state.tick % HASH_INTERVAL_TICKS === 0) {
      hashes.push({ tick: sim.state.tick, hash: hashState(sim.state) });
    }
  }

  const final: RecordedHash = { tick: sim.state.tick, hash: hashState(sim.state) };
  if (hashes[hashes.length - 1]?.tick !== final.tick) {
    hashes.push(final);
  }

  return { status: sim.state.status, stars: sim.state.stars, finalTick: sim.state.tick, hashes };
}
