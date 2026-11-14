import { describe, expect, it } from 'vitest';
import { duelRules } from '../../../src/data';
import { createDuelHand, cyclePlayedCard, handViewOf, isInHand } from '../../../src/sim/duelMatch';
import { cardAt, STARTER_DECK } from './duelMatchTestKit';

describe('Duel hand and card cycle (spec 18.4)', () => {
  it('deals a hand of the first 4 cards and shows the 5th as next', () => {
    const state = createDuelHand(STARTER_DECK, 7);
    expect(state.hand).toHaveLength(duelRules.deck.handSize);
    expect(handViewOf(state)).toEqual({ hand: state.hand, next: cardAt(state.queue, 0) });
    expect([...state.hand, ...state.queue].sort()).toEqual([...STARTER_DECK].sort());
  });

  it('shuffles the deck with the private seed: same seed, same order', () => {
    expect(createDuelHand(STARTER_DECK, 7)).toEqual(createDuelHand(STARTER_DECK, 7));
  });

  it('shuffles the deck with the private seed: other seeds give other orders', () => {
    const orders = [1, 2, 3, 4, 5, 6].map((seed) => {
      const state = createDuelHand(STARTER_DECK, seed);
      return [...state.hand, ...state.queue].join(',');
    });
    expect(new Set(orders).size).toBeGreaterThan(1);
    expect(orders).not.toContain(STARTER_DECK.join(','));
  });

  it('throws for an illegal deck', () => {
    expect(() => createDuelHand(STARTER_DECK.slice(0, 7), 7)).toThrow(/illegal deck/);
  });

  it('moves a played card to the back and puts the next card into the hand', () => {
    const state = createDuelHand(STARTER_DECK, 7);
    const played = cardAt(state.hand, 1);
    const next = cardAt(state.queue, 0);
    const secondNext = cardAt(state.queue, 1);
    expect(cyclePlayedCard(state, played)).toBe(true);
    expect(cardAt(state.hand, 1)).toBe(next);
    expect(handViewOf(state).next).toBe(secondNext);
    expect(cardAt(state.queue, -1)).toBe(played);
    expect(isInHand(state, played)).toBe(false);
  });

  it('returns a played card to the hand after 4 other cards were played', () => {
    const state = createDuelHand(STARTER_DECK, 7);
    const played = cardAt(state.hand, 0);
    cyclePlayedCard(state, played);
    for (let otherPlays = 1; otherPlays <= 4; otherPlays += 1) {
      expect(isInHand(state, played)).toBe(false);
      // The other three slots are played in turn, so no card is played twice.
      cyclePlayedCard(state, cardAt(state.hand, otherPlays % 4 === 0 ? 1 : otherPlays % 4));
      expect(handViewOf(state).next === played).toBe(otherPlays === 3);
    }
    expect(isInHand(state, played)).toBe(true);
  });

  it('keeps the deck at 8 different cards through a long cycle', () => {
    const state = createDuelHand(STARTER_DECK, 7);
    for (let plays = 0; plays < 50; plays += 1) {
      cyclePlayedCard(state, cardAt(state.hand, plays % 4));
      expect(new Set([...state.hand, ...state.queue]).size).toBe(duelRules.deck.deckSize);
    }
  });

  it('refuses a card that is not in the hand and changes nothing', () => {
    const state = createDuelHand(STARTER_DECK, 7);
    const before = structuredClone(state);
    expect(cyclePlayedCard(state, cardAt(state.queue, 0))).toBe(false);
    expect(cyclePlayedCard(state, 'no_such_card')).toBe(false);
    expect(state).toEqual(before);
  });
});
