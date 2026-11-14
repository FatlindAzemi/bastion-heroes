import type { DuelSim, Side } from '../../../src/sim/duel';
import type { DuelBotView } from '../../../src/sim/duelBot';
import type { DuelBotRandom } from '../../../src/sim/duelBot/types';

/** A random source that always picks the first entry, so strategy tests are exact. */
export const FIRST_CHOICE: DuelBotRandom = { index: () => 0 };

/** The view of a bot on a test sim with a fixed hand. */
export function viewOf(
  sim: DuelSim,
  side: Side,
  hand: readonly string[],
  next = hand[0],
): DuelBotView {
  return { side, state: sim.state, hand: { hand, next: next ?? '' } };
}
