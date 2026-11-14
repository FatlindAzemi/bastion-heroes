import { legalPlaysOfCard, playableCards } from './legalPlays';
import type { DuelBotStrategy } from './types';

/**
 * `easy` (spec 18.10): a random legal card. It picks one of the cards in hand
 * that can be played right now, then one of that card's legal tiles or lanes.
 */
export const easyStrategy: DuelBotStrategy = (view, random) => {
  const cards = playableCards(view);
  const cardId = cards[random.index(cards.length)];
  if (cardId === undefined) {
    return null;
  }
  const plays = legalPlaysOfCard(view, cardId);
  return plays[random.index(plays.length)] ?? null;
};
