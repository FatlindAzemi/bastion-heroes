import type { DuelBotsDef } from './schemas';

/**
 * Duel bot levels (spec 18.10): how often each level decides. What a level does
 * with a decision is code in `src/sim/duelBot/`; every tuning number is here.
 */
export const duelBots: DuelBotsDef = {
  // 18.10: easy decides every 3.0 s, normal every 1.5 s, hard every 0.75 s.
  easy: { decisionIntervalS: 3 },
  normal: { decisionIntervalS: 1.5 },
  hard: { decisionIntervalS: 0.75 },
};
