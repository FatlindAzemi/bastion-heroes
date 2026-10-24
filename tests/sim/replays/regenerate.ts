/**
 * Regenerates the committed golden replays of spec 11.6.
 *
 * Run from the repository root:
 *   npx tsx tests/sim/replays/regenerate.ts
 *
 * The command prints one JSON block per golden file (separated by
 * `=== <file name> ===` markers) to stdout. Copy each block over the matching
 * file in this folder, e.g. from a POSIX shell:
 *   npx tsx tests/sim/replays/regenerate.ts | \
 *     awk '/^=== /{file=$2; next} file{print > ("tests/sim/replays/" file)}'
 *
 * Regenerate only in the pull request that changes the rules or the W1-L01 data,
 * and state the reason in the PR description (spec 11.6). This file never writes
 * files itself (no Node types in the project) and the determinism test never runs
 * it: the golden JSON files are the source of truth.
 */
import { defenderById, levelById, rules } from '../../../src/data';
import type { LevelDef } from '../../../src/data';
import { createSim } from '../../../src/sim/createSim';
import { hashState } from '../../../src/sim/hash';
import { isCardReady } from '../../../src/sim/index';
import type { Command, Replay, ReplayCommand, Sim } from '../../../src/sim/types';
import { runReplay, type GoldenReplay, type ReplayResult } from './runner';

const LEVEL_ID = 'w1_l01';
const SEED = 10001;
const SPARKBOLT = 'sparkbolt_gremlin';
const LOADOUT = [{ defenderId: SPARKBOLT, level: 1 }];
/** Ticks the idle and economy scenarios are recorded for. */
const IDLE_END_TICK = 900;
const ECONOMY_END_TICK = 1200;
/** Upper bound for the full result scenario; the runner stops at the level result. */
const RESULT_END_TICK = 6000;

type Decision = (sim: Sim, level: LevelDef) => Command | null;

/** The fixed loadout of W1-L01; copied so the recorded replay owns its data. */
function loadout(): Replay['loadout'] {
  return LOADOUT.map((entry) => ({ ...entry }));
}

/** Resolves W1-L01 from the data registry (single source of truth, spec 11.2). */
function resolveLevel(): LevelDef {
  const level = levelById[LEVEL_ID];
  if (level === undefined) {
    throw new Error(`Level ${LEVEL_ID} is missing from src/data`);
  }
  return level;
}

/**
 * A simple deterministic player used to record the economy/result replays:
 * switch auto-collect on, then place a Sparkbolt Gremlin in the first free tile
 * of the active lane whenever the card is ready and the Essence is available.
 */
function autoPlay(sim: Sim, level: LevelDef): Command | null {
  const state = sim.state;
  if (state.status !== 'playing') {
    return null;
  }
  if (!state.autoCollect) {
    return { type: 'setAutoCollect', on: true };
  }
  const lane = level.activeLanes[0];
  const cost = defenderById[SPARKBOLT]?.cost;
  if (lane === undefined || cost === undefined || !isCardReady(state, 0)) {
    return null;
  }
  if (state.essence < cost) {
    return null;
  }
  for (let col = 0; col < rules.grid.columnCount; col += 1) {
    const occupied = state.defenders.some(
      (defender) => defender.lane === lane && defender.col === col,
    );
    if (!occupied) {
      return { type: 'place', defenderId: SPARKBOLT, lane, col };
    }
  }
  return null;
}

/** Runs a scenario while recording the commands a player would issue, tick by tick. */
function recordScenario(
  endTick: number,
  decide: Decision | null,
): ReplayResult & {
  commands: ReplayCommand[];
} {
  const level = resolveLevel();
  const sim = createSim(level, loadout(), SEED);
  const commands: ReplayCommand[] = [];

  while (sim.state.tick < endTick && sim.state.status === 'playing') {
    const command = decide === null ? null : decide(sim, level);
    if (command !== null) {
      sim.enqueue(command);
      commands.push({ tick: sim.state.tick, cmd: command });
    }
    sim.step();
  }

  const replay: Replay = { levelId: LEVEL_ID, seed: SEED, loadout: loadout(), commands };
  const result = runReplay(replay, endTick);
  const lastHash = result.hashes[result.hashes.length - 1];
  if (
    result.finalTick !== sim.state.tick ||
    lastHash?.hash !== hashState(sim.state) ||
    result.status !== sim.state.status
  ) {
    throw new Error('The recorded run and the replayed run differ (spec 11.6 regression)');
  }
  return { ...result, commands };
}

/** Wraps a recorded scenario into the committed golden replay shape. */
function toGolden(
  description: string,
  endTick: number,
  scenario: ReplayResult & { commands: ReplayCommand[] },
): GoldenReplay {
  return {
    description,
    levelId: LEVEL_ID,
    seed: SEED,
    loadout: loadout(),
    endTick,
    commands: scenario.commands,
    expected: {
      status: scenario.status,
      stars: scenario.stars,
      finalTick: scenario.finalTick,
      hashes: scenario.hashes,
    },
  };
}

/** Prints one golden file block to stdout (see the file header for how to split it). */
function printGolden(fileName: string, golden: GoldenReplay): void {
  console.log(`=== ${fileName} ===`);
  console.log(JSON.stringify(golden, null, 2));
}

const idle = recordScenario(IDLE_END_TICK, null);
printGolden(
  'w1_l01_idle_900.json',
  toGolden(
    'Idle W1-L01 for 900 ticks: sky-drop economy and the first wave spawn without player input.',
    IDLE_END_TICK,
    idle,
  ),
);

const economy = recordScenario(ECONOMY_END_TICK, autoPlay);
printGolden(
  'w1_l01_economy.json',
  toGolden(
    'W1-L01 economy run: auto-collect on and Sparkbolt Gremlin placed when affordable; exercises orbs, placement, shots and kills.',
    ECONOMY_END_TICK,
    economy,
  ),
);

const result = recordScenario(RESULT_END_TICK, autoPlay);
printGolden(
  'w1_l01_result.json',
  toGolden(
    `W1-L01 full result run: scripted auto-play until the level ends (${result.status}, ${result.stars} stars at tick ${result.finalTick}).`,
    RESULT_END_TICK,
    result,
  ),
);
