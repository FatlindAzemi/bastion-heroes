import { describe, expect, it } from 'vitest';
import { duelRules } from '../../../src/data';
import { duelCardKind, isValidDuelDeck, validateDuelDeck } from '../../../src/sim/duelMatch';
import { STARTER_DECK } from './duelMatchTestKit';

/** The starter deck with the cards at `index`... replaced by `cardIds`. */
function deckWith(replacements: Record<number, string>): string[] {
  return STARTER_DECK.map((cardId, index) => replacements[index] ?? cardId);
}

describe('Duel deck validation (spec 18.4)', () => {
  it('accepts the 8 Arena 1 cards as a legal starter deck (spec 20.2)', () => {
    expect(STARTER_DECK).toEqual(duelRules.arenas[0]?.unlocksCardIds);
    expect(validateDuelDeck(STARTER_DECK)).toEqual([]);
    expect(isValidDuelDeck(STARTER_DECK)).toBe(true);
  });

  it.each([7, 9, 0])('rejects a deck of %i cards: a deck has exactly 8 cards', (size) => {
    const deck = [...STARTER_DECK, 'pyro_fox'].slice(0, size);
    expect(validateDuelDeck(deck)).toContainEqual({ problem: 'wrongSize' });
  });

  it('rejects a deck with the same card twice: the 8 cards are different', () => {
    const deck = deckWith({ 1: 'sparkbolt_gremlin' });
    expect(validateDuelDeck(deck)).toEqual([
      { problem: 'duplicateCard', cardId: 'sparkbolt_gremlin' },
    ]);
  });

  it('rejects a deck with fewer than 2 defenders', () => {
    const deck = deckWith({ 1: 'gloom_ogre', 2: 'gloom_priest', 3: 'shieldbearer' });
    expect(validateDuelDeck(deck)).toEqual([{ problem: 'tooFewDefenders' }]);
  });

  it('rejects a deck with fewer than 2 raiders', () => {
    const deck = deckWith({ 5: 'pyro_fox', 6: 'rune_archer', 7: 'frost_witch' });
    expect(validateDuelDeck(deck)).toEqual([{ problem: 'tooFewRaiders' }]);
  });

  it('accepts a deck with exactly 2 defenders and one with exactly 2 raiders', () => {
    expect(validateDuelDeck(deckWith({ 2: 'gloom_ogre', 3: 'gloom_priest' }))).toEqual([]);
    expect(validateDuelDeck(deckWith({ 6: 'pyro_fox', 7: 'rune_archer' }))).toEqual([]);
  });

  it.each(['harbor_turtle', 'morvak'])('rejects %s: it is not a Duel card', (cardId) => {
    expect(duelCardKind(cardId)).toBeUndefined();
    expect(validateDuelDeck(deckWith({ 0: cardId }))).toContainEqual({
      problem: 'notADuelCard',
      cardId,
    });
  });

  it('rejects an unknown card id', () => {
    expect(validateDuelDeck(deckWith({ 0: 'no_such_card' }))).toEqual([
      { problem: 'notADuelCard', cardId: 'no_such_card' },
    ]);
  });

  it('names the kind of a Duel card', () => {
    expect(duelCardKind('iron_granny')).toBe('defender');
    expect(duelCardKind('gloomling')).toBe('raider');
  });

  it('reports every problem of a deck at once', () => {
    const problems = validateDuelDeck(['gloomling', 'gloomling', 'morvak']);
    expect(problems.map((entry) => entry.problem)).toEqual([
      'wrongSize',
      'duplicateCard',
      'notADuelCard',
      'tooFewDefenders',
      'tooFewRaiders',
    ]);
  });
});
