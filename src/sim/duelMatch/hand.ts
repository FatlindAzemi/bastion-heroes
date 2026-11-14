import { duelRules } from '../../data';
import { createRng } from '../rng';
import { validateDuelDeck } from './deck';

/**
 * The private cards of one player (spec 18.4). It is never part of the Duel sim
 * state and never sent to the other player (spec 19.3).
 */
export interface DuelHandState {
  /** The 4 cards the player can play. A slot keeps its position; a played card's slot gets the "next" card. */
  readonly hand: string[];
  /** The rest of the deck order; the first entry is the card shown as "next". */
  readonly queue: string[];
}

/** What a player sees of the own deck: the hand and the "next" card (spec 18.4, 19.5 `hand`). */
export interface DuelHandView {
  readonly hand: readonly string[];
  readonly next: string;
}

/** Unbiased shuffle with the mulberry32 generator of the sim (spec 3.2), seeded privately. */
function shuffledDeck(deck: readonly string[], privateSeed: number): string[] {
  const rng = createRng(privateSeed);
  const remaining = [...deck];
  const order: string[] = [];
  // Draws from the back to the front, so it is the classic shuffle written without swaps.
  while (remaining.length > 0) {
    const drawIndex = Math.floor(rng.next() * remaining.length);
    order.unshift(...remaining.splice(drawIndex, 1));
  }
  return order;
}

/**
 * Shuffles the deck with the player's private seed (spec 18.4): the first 4 cards
 * are the hand, the 5th is "next". Throws for a deck that is not legal.
 */
export function createDuelHand(deck: readonly string[], privateSeed: number): DuelHandState {
  const problems = validateDuelDeck(deck);
  if (problems.length > 0) {
    const names = problems.map((entry) => entry.problem).join(', ');
    throw new Error(`Cannot start a Duel with an illegal deck: ${names}.`);
  }
  const order = shuffledDeck(deck, privateSeed);
  const handSize = duelRules.deck.handSize;
  return { hand: order.slice(0, handSize), queue: order.slice(handSize) };
}

/** True when the card is one of the 4 cards in the hand (spec 19.3). */
export function isInHand(state: Readonly<DuelHandState>, cardId: string): boolean {
  return state.hand.includes(cardId);
}

/** The player's own view: hand and "next" (spec 18.4). */
export function handViewOf(state: Readonly<DuelHandState>): DuelHandView {
  const next = state.queue[0];
  if (next === undefined) {
    throw new Error('A Duel hand always has a next card (spec 18.4).');
  }
  return { hand: [...state.hand], next };
}

/**
 * Cycles a played card (spec 18.4): it moves to the back of the deck order and
 * the "next" card enters the hand, so the card returns after 4 other plays.
 * Returns false and changes nothing when the card is not in the hand.
 */
export function cyclePlayedCard(state: DuelHandState, cardId: string): boolean {
  const slot = state.hand.indexOf(cardId);
  const next = state.queue[0];
  if (slot === -1 || next === undefined) {
    return false;
  }
  state.queue.shift();
  state.hand[slot] = next;
  state.queue.push(cardId);
  return true;
}
