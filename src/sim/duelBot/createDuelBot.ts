import { duelBots } from '../../data';
import { acceptsCommands, type DuelState, type Side } from '../duel';
import type { DuelCardPlay, DuelHandView } from '../duelMatch';
import { createRng } from '../rng';
import { ticksFromSeconds } from '../time';
import { easyStrategy } from './easy';
import { hardStrategy } from './hard';
import { normalStrategy } from './normal';
import type { DuelBot, DuelBotLevel, DuelBotRandom, DuelBotStrategy } from './types';

/** What a bot needs: its level, its side and the seed of its own random choices. */
export interface DuelBotOptions {
  readonly level: DuelBotLevel;
  readonly side: Side;
  /** Seed of the bot's private generator; the same seed gives the same decisions. */
  readonly seed: number;
}

const STRATEGIES: Readonly<Record<DuelBotLevel, DuelBotStrategy>> = {
  easy: easyStrategy,
  normal: normalStrategy,
  hard: hardStrategy,
};

/** The bot's own mulberry32 generator (spec 3.2); it never touches `state.rng`. */
function createBotRandom(seed: number): DuelBotRandom {
  const rng = createRng(seed);
  return { index: (count) => Math.floor(rng.next() * count) };
}

/**
 * Creates a bot (spec 18.10). It decides on the first tick that accepts commands
 * and then every `decisionIntervalS` of its level; one decision plays at most one
 * card. It reads only the public state and its own hand, and is deterministic
 * for a given seed.
 */
export function createDuelBot(options: DuelBotOptions): DuelBot {
  const { level, side } = options;
  const random = createBotRandom(options.seed);
  const intervalS = duelBots[level].decisionIntervalS;
  /** Tick of the first decision; null until the countdown is over. */
  let firstDecisionTick: number | null = null;
  let decisionCount = 0;

  function decide(state: Readonly<DuelState>, hand: DuelHandView): DuelCardPlay | null {
    if (state.result !== null || !acceptsCommands(state)) {
      return null;
    }
    firstDecisionTick ??= state.tick;
    // Counting from the first decision keeps the 0.75 s rhythm exact over a match (22.5 ticks).
    if (state.tick < firstDecisionTick + ticksFromSeconds(decisionCount * intervalS)) {
      return null;
    }
    decisionCount += 1;
    return STRATEGIES[level]({ side, state, hand }, random);
  }

  return { level, side, decide };
}
