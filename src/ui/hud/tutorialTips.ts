/**
 * First-time tutorial tips of W1-L01 to W1-L04 (spec 4.9, M4 design decision:
 * non-blocking and once per level instead of blocked inputs). The save records
 * each tip id in `tutorial.seenHints`; `src/main.ts` shows the tip exactly once.
 */
import type { HudTipView } from './types';

/** One tip per early level, in the order the mechanics unlock. */
const TIPS: Readonly<Record<string, string>> = {
  w1_l01: 'Tap a card, then tap a lane tile to place your defender.',
  w1_l02: 'Collect Essence orbs before they fade. Producers keep the supply flowing.',
  w1_l03: 'Match damage to armor: Arcane beats Spectral, Blast cracks Armored.',
  w1_l04: 'Merge two identical ★1 defenders into a ★2 fighter.',
};

/** Stable seen-hint id of a level's tip. */
export function tutorialTipId(levelId: string): string {
  return `tip_${levelId}`;
}

/** The tip of a level unless the save already remembered it; null otherwise. */
export function tutorialTipFor(levelId: string, seenHints: readonly string[]): HudTipView | null {
  const text = TIPS[levelId];
  const id = tutorialTipId(levelId);
  if (text === undefined || seenHints.includes(id)) {
    return null;
  }
  return { id, text };
}
