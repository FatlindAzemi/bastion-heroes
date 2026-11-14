import type { DuelResult, Side } from '../duel';
import { DUEL_SIDES } from '../duel';
import {
  createLocalDuelMatch,
  type DuelPlayRejectReason,
  type LocalDuelMatch,
} from '../duelMatch';
import { createDuelBot } from './createDuelBot';
import type { DuelBot, DuelBotLevel } from './types';

/**
 * Lets a bot act on a local match (spec 18.10): call it once per tick before
 * `match.step()`. The bot gets the public state and its own hand only and plays
 * through `match.play`, the call the HUD uses. Returns the host's reject reason,
 * or null when the bot waited or its play was passed to the sim.
 */
export function playDuelBotTurn(bot: DuelBot, match: LocalDuelMatch): DuelPlayRejectReason | null {
  const play = bot.decide(match.state, match.handOf(bot.side));
  return play === null ? null : match.play(bot.side, play);
}

/** One bot player of a headless match: deck, private shuffle seed, level and bot seed. */
export interface DuelBotPlayerSetup {
  readonly deck: readonly string[];
  readonly privateSeed: number;
  readonly level: DuelBotLevel;
  readonly botSeed: number;
}

/** A headless match between two bots. */
export interface DuelBotMatchOptions {
  readonly seed: number;
  readonly players: Record<Side, DuelBotPlayerSetup>;
}

/** How a headless bot match went. */
export interface DuelBotMatchReport {
  readonly result: DuelResult;
  /** Gate health of both sides at the end (spec 18.7). */
  readonly gates: Record<Side, number>;
  /** Ticks the match ran. */
  readonly ticks: number;
  /** Plays of each side that the host or the sim refused; a bot must keep this at 0. */
  readonly rejectedPlays: Record<Side, number>;
}

/** Counts the plays the host refuses and the commands the sim rejects, per side. */
function stepWithBots(
  match: LocalDuelMatch,
  bots: readonly DuelBot[],
  rejectedPlays: Record<Side, number>,
): void {
  for (const bot of bots) {
    if (playDuelBotTurn(bot, match) !== null) {
      rejectedPlays[bot.side] += 1;
    }
  }
  for (const event of match.step()) {
    if (event.type === 'commandRejected') {
      rejectedPlays[event.side] += 1;
    }
  }
}

/**
 * Plays a whole Duel between two bots without a renderer (spec 18.10, 16.7).
 * The same options always give the same report.
 */
export function runDuelBotMatch(options: DuelBotMatchOptions): DuelBotMatchReport {
  const match = createLocalDuelMatch(options);
  const bots = DUEL_SIDES.map((side) =>
    createDuelBot({ level: options.players[side].level, side, seed: options.players[side].botSeed }),
  );
  const rejectedPlays: Record<Side, number> = { south: 0, north: 0 };
  while (match.state.result === null) {
    stepWithBots(match, bots, rejectedPlays);
  }
  const { sides } = match.state;
  const gates = { south: sides.south.gateHealth, north: sides.north.gateHealth };
  return { result: match.state.result, gates, ticks: match.state.tick, rejectedPlays };
}
