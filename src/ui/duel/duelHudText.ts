/**
 * Pure texts of the Duel HUD and result screen (spec 18.2, 18.5, 18.9), unit-tested
 * in `tests/ui/duelHudText.test.ts`.
 */
import type { DuelEndReason, DuelHudRejectReason, DuelOutcome, TrainingBotLevel } from './types';

/**
 * Player-facing reason texts (spec 18.5, 18.6, 3.4). Reasons mapped to null have no
 * text in the spec (`cardNotInHand`, #142; the countdown) and only shake the card.
 */
const REJECT_MESSAGES: Readonly<Record<DuelHudRejectReason, string | null>> = {
  notEnoughEssence: 'Not enough Essence',
  notYourSide: 'Not your side',
  tileOccupied: 'Tile occupied',
  tooManyRaiders: 'Too many raiders',
  invalidTile: 'Invalid tile',
  cardLimitReached: 'Max 1 per player',
  invalidCard: null,
  matchNotRunning: null,
  cardNotInHand: null,
};

/** The red reason text of a refused play, or null when the spec gives none. */
export function rejectMessage(reason: DuelHudRejectReason): string | null {
  return REJECT_MESSAGES[reason];
}

/** Formats seconds as the match clock "m:ss", rounding up so 0:00 means the end (18.2). */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Readable bot level names (spec 18.10). */
export const BOT_LEVEL_NAMES: Readonly<Record<TrainingBotLevel, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** Everything the result panel writes for one finished Duel. */
export interface DuelResultText {
  readonly heading: string;
  readonly subtitle: string;
}

const HEADINGS: Readonly<Record<DuelOutcome, string>> = {
  won: 'Victory!',
  lost: 'Defeat',
  draw: 'Draw',
};

/** The subtitle names how the match ended (spec 18.2) from the player's view. */
function resultSubtitle(outcome: DuelOutcome, reason: DuelEndReason): string {
  if (outcome === 'draw') {
    return 'No gate fell in sudden death.';
  }
  const won = outcome === 'won';
  if (reason === 'gate') {
    return won ? 'The enemy gate fell.' : 'Your gate fell.';
  }
  if (reason === 'surrender') {
    return won ? 'The opponent surrendered.' : 'You surrendered.';
  }
  if (reason === 'forfeit') {
    return won ? 'The opponent left the match.' : 'You left the match.';
  }
  return won ? 'Your gate held stronger.' : 'Their gate held stronger.';
}

/** Heading and subtitle of the Duel result screen (spec 18.9). */
export function duelResultText(outcome: DuelOutcome, reason: DuelEndReason): DuelResultText {
  return { heading: HEADINGS[outcome], subtitle: resultSubtitle(outcome, reason) };
}
