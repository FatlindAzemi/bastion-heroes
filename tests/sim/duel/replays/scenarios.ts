import { DUEL_SIDES } from '../../../../src/sim/duel';
import type { Side } from '../../../../src/sim/duel';
import { createDuelBot, playDuelBotTurn } from '../../../../src/sim/duelBot';
import type { DuelBotLevel } from '../../../../src/sim/duelBot';
import {
  createRecordedDuelMatch,
  type DuelReplay,
  type DuelReplayResult,
  type LocalDuelMatchOptions,
} from '../../../../src/sim/duelMatch';
import { OTHER_DECK, STARTER_DECK } from '../../duelMatch/duelMatchTestKit';
import { REGULAR_START_TICK } from '../duelTestKit';

/** A committed golden Duel replay: the replay plus its expected result (spec 11.6, 16.7). */
export interface GoldenDuelReplay extends DuelReplay {
  /** What this replay exercises; shown in the test name and used for regeneration. */
  description: string;
  expected: DuelReplayResult;
}

/** A bot player of a recorded scenario; bots only produce the commands (spec 18.10). */
export interface ScenarioBot {
  level: DuelBotLevel;
  botSeed: number;
}

/** A scripted match that is recorded into a golden replay. */
export interface DuelScenario {
  fileName: string;
  description: string;
  options: LocalDuelMatchOptions;
  /** The bot of each side, or null for a side that never plays a card. */
  bots: Record<Side, ScenarioBot | null>;
  /** A side that surrenders at a fixed tick, or null. */
  surrender: { side: Side; tick: number } | null;
}

/** 60 s into regular time; a test-scenario choice, not a rule number. */
const SURRENDER_TICK = REGULAR_START_TICK + 1800;

/** The three golden Duel replays of `tests/sim/duel/replays/` (spec 16.7). */
export const DUEL_SCENARIOS: readonly DuelScenario[] = [
  {
    fileName: 'idle_to_time.json',
    description:
      'Nobody plays a card: countdown, regular time, overdrive and sudden death run out and the match ends by time.',
    options: {
      seed: 101,
      players: {
        south: { deck: STARTER_DECK, privateSeed: 11 },
        north: { deck: STARTER_DECK, privateSeed: 22 },
      },
    },
    bots: { south: null, north: null },
    surrender: null,
  },
  {
    fileName: 'hard_vs_easy_gate.json',
    description:
      'Hard bot (south) against easy bot (north) with starter decks: defenders, raiders, traps, and the north gate breaks.',
    options: {
      seed: 202,
      players: {
        south: { deck: STARTER_DECK, privateSeed: 6 },
        north: { deck: STARTER_DECK, privateSeed: 44 },
      },
    },
    bots: { south: { level: 'hard', botSeed: 5 }, north: { level: 'easy', botSeed: 106 } },
    surrender: null,
  },
  {
    fileName: 'normal_vs_hard_surrender.json',
    description:
      'Normal bot (south, other deck) against hard bot (north, starter deck); south surrenders 60 s into regular time.',
    options: {
      seed: 303,
      players: {
        south: { deck: OTHER_DECK, privateSeed: 55 },
        north: { deck: STARTER_DECK, privateSeed: 66 },
      },
    },
    bots: { south: { level: 'normal', botSeed: 7 }, north: { level: 'hard', botSeed: 8 } },
    surrender: { side: 'south', tick: SURRENDER_TICK },
  },
];

/**
 * Plays a scenario live through a recording host: each tick the bots act, the
 * scripted surrender happens, then the match steps (spec 18.10 Training order).
 * Returns the recorded replay and the live final state hash source.
 */
export function recordScenario(scenario: DuelScenario): ReturnType<typeof createRecordedDuelMatch> {
  const recorded = createRecordedDuelMatch(scenario.options);
  const bots = DUEL_SIDES.flatMap((side) => {
    const bot = scenario.bots[side];
    return bot === null ? [] : [createDuelBot({ level: bot.level, side, seed: bot.botSeed })];
  });
  const { match } = recorded;
  while (match.state.result === null) {
    for (const bot of bots) {
      playDuelBotTurn(bot, match);
    }
    if (scenario.surrender !== null && match.state.tick === scenario.surrender.tick) {
      match.surrender(scenario.surrender.side);
    }
    match.step();
  }
  return recorded;
}
