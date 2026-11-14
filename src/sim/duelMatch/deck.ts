import { duelRules } from '../../data';
import { duelDefenderCard, duelRaiderCard } from '../duel';

/** The two kinds of Duel cards (spec 18.4, 18.8). */
export type DuelCardKind = 'defender' | 'raider';

/**
 * What is wrong with a deck (spec 18.4):
 * - `wrongSize`: the deck does not have exactly 8 cards.
 * - `duplicateCard`: `cardId` is in the deck more than once.
 * - `notADuelCard`: `cardId` is unknown, has no `duel` block or is excluded from the Duel.
 * - `tooFewDefenders` / `tooFewRaiders`: fewer than 2 cards of that kind.
 */
export type DuelDeckProblem =
  | { problem: 'wrongSize' }
  | { problem: 'duplicateCard'; cardId: string }
  | { problem: 'notADuelCard'; cardId: string }
  | { problem: 'tooFewDefenders' }
  | { problem: 'tooFewRaiders' };

/** Kind of a Duel card, or undefined when the id is not a Duel card (spec 18.4, 18.8). */
export function duelCardKind(cardId: string): DuelCardKind | undefined {
  if (duelRules.deck.excludedCardIds.includes(cardId)) {
    return undefined;
  }
  if (duelDefenderCard(cardId) !== undefined) {
    return 'defender';
  }
  return duelRaiderCard(cardId) === undefined ? undefined : 'raider';
}

/** One problem per card id that is in the deck more than once. */
function duplicateProblems(cardIds: readonly string[]): DuelDeckProblem[] {
  const duplicates = cardIds.filter((cardId, index) => cardIds.indexOf(cardId) !== index);
  return [...new Set(duplicates)].map((cardId) => ({ problem: 'duplicateCard', cardId }));
}

/** One problem per different card id that is not a Duel card. */
function unknownCardProblems(cardIds: readonly string[]): DuelDeckProblem[] {
  return [...new Set(cardIds)]
    .filter((cardId) => duelCardKind(cardId) === undefined)
    .map((cardId) => ({ problem: 'notADuelCard', cardId }));
}

/** Problems of the "at least 2 defenders and at least 2 raiders" rule; different cards count once. */
function kindProblems(cardIds: readonly string[]): DuelDeckProblem[] {
  const kinds = [...new Set(cardIds)].map(duelCardKind);
  const problems: DuelDeckProblem[] = [];
  if (kinds.filter((kind) => kind === 'defender').length < duelRules.deck.minDefenders) {
    problems.push({ problem: 'tooFewDefenders' });
  }
  if (kinds.filter((kind) => kind === 'raider').length < duelRules.deck.minRaiders) {
    problems.push({ problem: 'tooFewRaiders' });
  }
  return problems;
}

/**
 * Checks a deck against spec 18.4: exactly 8 different Duel cards, at least 2
 * defenders and at least 2 raiders. Returns every problem; an empty list means
 * the deck is legal. Card ownership and arenas are not checked here.
 */
export function validateDuelDeck(cardIds: readonly string[]): DuelDeckProblem[] {
  const sizeProblems: DuelDeckProblem[] =
    cardIds.length === duelRules.deck.deckSize ? [] : [{ problem: 'wrongSize' }];
  return [
    ...sizeProblems,
    ...duplicateProblems(cardIds),
    ...unknownCardProblems(cardIds),
    ...kindProblems(cardIds),
  ];
}

/** True when the deck is legal (spec 18.4). */
export function isValidDuelDeck(cardIds: readonly string[]): boolean {
  return validateDuelDeck(cardIds).length === 0;
}
