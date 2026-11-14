import type { duelBots } from '../../data';
import type { DuelState, Side } from '../duel';
import type { DuelCardPlay, DuelHandView } from '../duelMatch';

/** The three bot levels (spec 18.10). */
export type DuelBotLevel = keyof typeof duelBots;

/**
 * Everything a bot may look at (spec 18.10, 19.3): the public Duel state and the
 * own hand with its "next" card. The opponent's hand and deck order are not in it.
 */
export interface DuelBotView {
  /** The side the bot plays. */
  readonly side: Side;
  /** The public sim state both players see. */
  readonly state: Readonly<DuelState>;
  /** The bot's own hand and "next" card (spec 18.4). */
  readonly hand: DuelHandView;
}

/** The random source of a bot; never the sim's generator, so a bot cannot change the match seed. */
export interface DuelBotRandom {
  /** A whole number from 0 to `count - 1`. */
  index(count: number): number;
}

/** Picks the play of one decision, or null to wait (spec 18.10). */
export type DuelBotStrategy = (view: DuelBotView, random: DuelBotRandom) => DuelCardPlay | null;

/** A player driven by code (spec 18.10). It sends the same card plays as a human. */
export interface DuelBot {
  readonly level: DuelBotLevel;
  readonly side: Side;
  /**
   * Called once per tick before the match steps. Returns the card play the bot
   * sends on this tick, or null when it does not decide now or decides to wait.
   */
  decide(state: Readonly<DuelState>, hand: DuelHandView): DuelCardPlay | null;
}
