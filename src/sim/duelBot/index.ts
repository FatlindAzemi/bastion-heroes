/**
 * Duel bots (spec 18.10): players driven by code. A bot reads the public Duel
 * state and its own hand and sends the same card plays as a human.
 */
export { createDuelBot, type DuelBotOptions } from './createDuelBot';
export {
  playDuelBotTurn,
  runDuelBotMatch,
  type DuelBotMatchOptions,
  type DuelBotMatchReport,
  type DuelBotPlayerSetup,
} from './botMatch';
export type { DuelBot, DuelBotLevel, DuelBotView } from './types';
