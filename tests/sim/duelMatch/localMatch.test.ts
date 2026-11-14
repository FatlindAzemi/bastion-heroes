import { describe, expect, it } from 'vitest';
import { duelRules } from '../../../src/data';
import { createLocalDuelMatch, duelCardKind } from '../../../src/sim/duelMatch';
import type { DuelCardPlay, LocalDuelMatch } from '../../../src/sim/duelMatch';
import type { Side } from '../../../src/sim/duel';
import { SUDDEN_DEATH_END_TICK } from '../duel/duelTestKit';
import {
  cardAt,
  createMatch,
  createStartedMatch,
  OTHER_DECK,
  STARTER_DECK,
  stepMatch,
} from './duelMatchTestKit';

/** A legal play of the card for the side: own back column for defenders, lane 2. */
function playOf(side: Side, cardId: string, lane = 2): DuelCardPlay {
  const col = side === 'south' ? 0 : 8;
  return duelCardKind(cardId) === 'defender' ? { cardId, lane, col } : { cardId, lane };
}

/** First card in the side's hand of the given kind. */
function cardInHand(match: LocalDuelMatch, side: Side, kind: 'defender' | 'raider'): string {
  const cardId = match.handOf(side).hand.find((id) => duelCardKind(id) === kind);
  if (cardId === undefined) {
    throw new Error(`No ${kind} in the hand of ${side}.`);
  }
  return cardId;
}

/** Collects every property name of a value, recursively. */
function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      keysOf(child, keys);
    }
  }
  return keys;
}

describe('local Duel match host (spec 18.4, 18.10, 19.3)', () => {
  it('deals both players a first hand during the countdown', () => {
    const match = createMatch();
    expect(match.state.phase).toBe('countdown');
    for (const side of ['south', 'north'] as const) {
      expect(match.handOf(side).hand).toHaveLength(duelRules.deck.handSize);
      expect(STARTER_DECK).toContain(match.handOf(side).next);
    }
  });

  it('throws when a player brings an illegal deck', () => {
    const players = {
      south: { deck: STARTER_DECK, privateSeed: 1 },
      north: { deck: STARTER_DECK.slice(1), privateSeed: 2 },
    };
    expect(() => createLocalDuelMatch({ seed: 1, players })).toThrow(/illegal deck/);
  });

  it('refuses plays during the countdown and keeps the hand', () => {
    const match = createMatch();
    const hand = match.handOf('south');
    expect(match.play('south', playOf('south', cardAt(hand.hand, 0)))).toBe('matchNotRunning');
    expect(stepMatch(match, 1)).toEqual([]);
    expect(match.handOf('south')).toEqual(hand);
  });

  it('refuses a card that is not in the hand; the sim never sees it', () => {
    const match = createStartedMatch();
    const { next } = match.handOf('south');
    expect(match.play('south', playOf('south', next))).toBe('cardNotInHand');
    expect(match.play('south', playOf('south', 'pyro_fox'))).toBe('cardNotInHand');
    expect(stepMatch(match, 1).filter((event) => event.type === 'commandRejected')).toEqual([]);
    expect(match.state.sides.south.essence).toBe(duelRules.essence.startingEssence);
  });

  it('refuses a defender play without a column', () => {
    const match = createStartedMatch();
    const cardId = cardInHand(match, 'south', 'defender');
    expect(match.play('south', { cardId, lane: 2 })).toBe('invalidTile');
  });

  it('passes a play of a card in hand to the sim and cycles the card', () => {
    const match = createStartedMatch();
    const before = match.handOf('south');
    const cardId = cardInHand(match, 'south', 'defender');
    expect(match.play('south', playOf('south', cardId))).toBeNull();
    const events = stepMatch(match, 1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'defenderPlaced', side: 'south' }),
    );
    const after = match.handOf('south');
    expect(after.hand).not.toContain(cardId);
    expect(after.hand[before.hand.indexOf(cardId)]).toBe(before.next);
    expect(after.next).not.toBe(before.next);
  });

  it('plays raider cards from the hand as playRaider commands', () => {
    const match = createStartedMatch();
    const cardId = cardInHand(match, 'north', 'raider');
    expect(match.play('north', playOf('north', cardId))).toBeNull();
    stepMatch(match, 1);
    expect(match.state.summons.every((summon) => summon.side === 'north')).toBe(true);
    expect(match.state.summons.length).toBeGreaterThan(0);
    expect(match.handOf('north').hand).not.toContain(cardId);
  });

  it('keeps a card in hand when the sim rejects the play', () => {
    const match = createStartedMatch();
    const before = match.handOf('south');
    const cardId = cardInHand(match, 'south', 'defender');
    // Column 8 belongs to north: the sim rejects with "Not your side".
    expect(match.play('south', { cardId, lane: 2, col: 8 })).toBeNull();
    const events = stepMatch(match, 1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'commandRejected', reason: 'notYourSide' }),
    );
    expect(match.handOf('south')).toEqual(before);
  });

  it('refuses a second play of a card whose play of this tick is still open', () => {
    const match = createStartedMatch();
    const cardId = cardInHand(match, 'south', 'raider');
    expect(match.play('south', playOf('south', cardId, 1))).toBeNull();
    expect(match.play('south', playOf('south', cardId, 3))).toBe('cardNotInHand');
  });

  it('returns a played card to the hand after 4 other accepted plays', () => {
    const match = createStartedMatch();
    const first = cardAt(match.handOf('south').hand, 0);
    const played: string[] = [];
    while (played.length < 5) {
      // Wait for the Essence, then play the newest card that is not the first one again.
      const hand = match.handOf('south').hand;
      const cardId = played.length === 0 ? first : hand.find((id) => !played.includes(id));
      expect(cardId).toBeDefined();
      expect(match.handOf('south').hand.includes(first)).toBe(played.length === 0);
      match.play('south', playOf('south', cardId as string, played.length % 5));
      const rejected = stepMatch(match, 1).some((event) => event.type === 'commandRejected');
      if (!rejected) {
        played.push(cardId as string);
      }
    }
    expect(new Set(played).size).toBe(5);
    expect(match.handOf('south').hand).toContain(first);
  });

  it('keeps the hands of the two players apart', () => {
    const match = createStartedMatch();
    const northBefore = match.handOf('north');
    match.play('south', playOf('south', cardInHand(match, 'south', 'raider')));
    stepMatch(match, 1);
    expect(match.handOf('north')).toEqual(northBefore);
  });

  it('ends by surrender and refuses plays after the end', () => {
    const match = createStartedMatch();
    match.surrender('south');
    const events = stepMatch(match, 1);
    expect(events).toContainEqual({ type: 'duelEnded', winner: 'north', reason: 'surrender' });
    expect(match.state.result).toEqual({ winner: 'north', reason: 'surrender' });
    const cardId = cardAt(match.handOf('north').hand, 0);
    expect(match.play('north', playOf('north', cardId))).toBe('matchNotRunning');
    expect(match.step()).toEqual([]);
  });

  it('runs a whole Training match to its result without any play', () => {
    const match = createMatch();
    stepMatch(match, SUDDEN_DEATH_END_TICK);
    expect(match.state.result).toEqual({ winner: 'draw', reason: 'time' });
  });
});

describe('the Duel sim state holds no private information (spec 19.3)', () => {
  /** Plays every affordable card in hand for both sides for 20 s. */
  function playedMatch(southDeck: readonly string[], southSeed: number): LocalDuelMatch {
    const match = createLocalDuelMatch({
      seed: 5,
      players: {
        south: { deck: southDeck, privateSeed: southSeed },
        north: { deck: STARTER_DECK, privateSeed: 99 },
      },
    });
    for (let tick = 0; tick < 690; tick += 1) {
      for (const side of ['south', 'north'] as const) {
        match.play(side, playOf(side, cardAt(match.handOf(side).hand, tick % 4), tick % 5));
      }
      match.step();
    }
    return match;
  }

  it('has no hand, deck, queue, order or private-seed field anywhere', () => {
    const match = playedMatch(STARTER_DECK, 1);
    expect(match.state.defenders.length + match.state.enemies.length).toBeGreaterThan(0);
    const privateKeys = [...keysOf(match.state)].filter((key) =>
      /hand|deck|queue|order|private|nextCard/i.test(key),
    );
    expect(privateKeys).toEqual([]);
  });

  it('never stores a card id that was not played', () => {
    const match = playedMatch(OTHER_DECK, 1);
    const unplayed = OTHER_DECK.filter(
      (cardId) =>
        !match.state.defenders.some((unit) => unit.side === 'south' && unit.defenderId === cardId),
    ).filter((cardId) => duelCardKind(cardId) === 'defender');
    const serialized = JSON.stringify(match.state);
    for (const cardId of unplayed) {
      expect(serialized).not.toContain(cardId);
    }
  });

  it('is the same before the first play whatever the decks and private seeds are', () => {
    const first = createLocalDuelMatch({
      seed: 5,
      players: {
        south: { deck: STARTER_DECK, privateSeed: 1 },
        north: { deck: STARTER_DECK, privateSeed: 2 },
      },
    });
    const second = createLocalDuelMatch({
      seed: 5,
      players: {
        south: { deck: OTHER_DECK, privateSeed: 31 },
        north: { deck: OTHER_DECK, privateSeed: 32 },
      },
    });
    stepMatch(first, 200);
    stepMatch(second, 200);
    expect(JSON.stringify(first.state)).toBe(JSON.stringify(second.state));
  });
});
