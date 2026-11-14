import { describe, expect, it } from 'vitest';

import { duelRules, rules } from '../src/data';
import {
  duelHudEventsOf,
  duelHudStateOf,
  essenceProgressOf,
  trainingOpponent,
  trainingOutcomeOf,
} from '../src/duelTrainingView';
import type { DuelEvent } from '../src/sim/duel';
import { createLocalDuelMatch, type LocalDuelMatch } from '../src/sim/duelMatch';

// Issue #130: the Training match projected into the Duel HUD view (spec 18.2, 18.3, 18.9).

const DECK = duelRules.arenas[0]?.unlocksCardIds ?? [];

function createMatch(): LocalDuelMatch {
  return createLocalDuelMatch({
    seed: 7,
    players: { south: { deck: DECK, privateSeed: 1 }, north: { deck: DECK, privateSeed: 2 } },
  });
}

function stepTicks(match: LocalDuelMatch, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    match.step();
  }
}

describe('duelHudStateOf', () => {
  it('shows the countdown and the full clock before the match starts', () => {
    const match = createMatch();
    const view = duelHudStateOf(match.state, match.handOf('south'), trainingOpponent('easy'), 0);
    expect(view.phase).toBe('countdown');
    expect(view.countdownSeconds).toBe(duelRules.match.countdownS);
    expect(view.clockSeconds).toBe(duelRules.match.regularTimeS + duelRules.match.overdriveTimeS);
    expect(view.essence).toBe(duelRules.essence.startingEssence);
    expect(view.ownGate).toBe(duelRules.gate.gateHealth);
    expect(view.hand).toHaveLength(duelRules.deck.handSize);
    expect(view.opponent).toMatchObject({ isBot: true, trophies: null, botLevel: 'easy' });
  });

  it('counts the clock down in regular time', () => {
    const match = createMatch();
    stepTicks(match, (duelRules.match.countdownS + 10) * rules.tick.tickRate);
    const view = duelHudStateOf(match.state, match.handOf('south'), trainingOpponent('hard'), 0);
    expect(view.phase).toBe('regular');
    expect(view.countdownSeconds).toBe(0);
    expect(view.clockSeconds).toBeCloseTo(
      duelRules.match.regularTimeS + duelRules.match.overdriveTimeS - 10,
      0,
    );
  });
});

describe('essenceProgressOf', () => {
  it('is 0 in the countdown and between 0 and 1 while Essence comes in', () => {
    const match = createMatch();
    expect(essenceProgressOf(match.state, 'south', 0)).toBe(0);
    stepTicks(match, duelRules.match.countdownS * rules.tick.tickRate + 20);
    const progress = essenceProgressOf(match.state, 'south', 0.5);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
  });
});

describe('duelHudEventsOf', () => {
  it('keeps only the player rejects, phase changes and gate hits', () => {
    const command = { type: 'surrender', side: 'north' } as const;
    const events: DuelEvent[] = [
      { type: 'commandRejected', side: 'south', reason: 'notEnoughEssence', command },
      { type: 'commandRejected', side: 'north', reason: 'tileOccupied', command },
      { type: 'phaseChanged', phase: 'overdrive' },
      { type: 'gateDamaged', side: 'north', amount: 1, health: 7 },
      { type: 'essenceChanged', side: 'south', essence: 6 },
    ];
    expect(duelHudEventsOf(events)).toEqual([
      { type: 'commandRejected', reason: 'notEnoughEssence' },
      { type: 'phaseChanged', phase: 'overdrive' },
      { type: 'gateDamaged', own: false },
    ]);
  });
});

describe('trainingOutcomeOf', () => {
  it('maps the winner to the player view', () => {
    expect(trainingOutcomeOf('south')).toBe('won');
    expect(trainingOutcomeOf('north')).toBe('lost');
    expect(trainingOutcomeOf('draw')).toBe('draw');
  });
});
