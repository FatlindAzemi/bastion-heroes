import { describe, expect, it } from 'vitest';

import { defenderById, enemyById } from '../../src/data';
import { duelCardView } from '../../src/ui/duel/duelCards';
import { duelResultText, formatClock, rejectMessage } from '../../src/ui/duel/duelHudText';
import { resolveDuelTap } from '../../src/ui/duel/duelTap';

// Issue #130: pure helpers of the Duel HUD (spec 18.5, 18.9).

describe('duelCardView', () => {
  it('reads a defender card from its data file (spec 18.8)', () => {
    const card = duelCardView('glowshroom_monk');
    expect(card).toMatchObject({ kind: 'defender', name: 'Glowshroom Monk' });
    expect(card?.cost).toBe(defenderById.glowshroom_monk?.duel?.cost);
  });

  it('reads a raider card from its data file (spec 18.8)', () => {
    const card = duelCardView('gloomling');
    expect(card).toMatchObject({ kind: 'raider', name: 'Gloomling' });
    expect(card?.cost).toBe(enemyById.gloomling?.duel?.cost);
  });

  it('returns null for an unknown card', () => {
    expect(duelCardView('not_a_card')).toBeNull();
  });
});

describe('rejectMessage', () => {
  it('uses the reason texts of spec 18.5 and 18.6', () => {
    expect(rejectMessage('notEnoughEssence')).toBe('Not enough Essence');
    expect(rejectMessage('notYourSide')).toBe('Not your side');
    expect(rejectMessage('tileOccupied')).toBe('Tile occupied');
    expect(rejectMessage('tooManyRaiders')).toBe('Too many raiders');
  });

  it('has no text for reasons the spec does not name (#142)', () => {
    expect(rejectMessage('cardNotInHand')).toBeNull();
    expect(rejectMessage('matchNotRunning')).toBeNull();
  });
});

describe('formatClock', () => {
  it('formats m:ss and rounds up', () => {
    expect(formatClock(180)).toBe('3:00');
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(-1)).toBe('0:00');
  });
});

describe('duelResultText', () => {
  it('names the outcome and how the match ended', () => {
    expect(duelResultText('won', 'gate')).toEqual({
      heading: 'Victory!',
      subtitle: 'The enemy gate fell.',
    });
    expect(duelResultText('lost', 'surrender').subtitle).toBe('You surrendered.');
    expect(duelResultText('draw', 'time').heading).toBe('Draw');
  });
});

describe('resolveDuelTap', () => {
  it('turns a board point into lane and column', () => {
    expect(resolveDuelTap({ x: 1.4, z: 2.7 }, 'defender')).toEqual({
      kind: 'play',
      lane: 2,
      col: 1,
    });
  });

  it('still plays a defender on the other side, so the sim can say "Not your side"', () => {
    expect(resolveDuelTap({ x: 6.5, z: 0.5 }, 'defender')).toEqual({
      kind: 'play',
      lane: 0,
      col: 6,
    });
  });

  it('cancels off the board or without a held card', () => {
    expect(resolveDuelTap({ x: 9.5, z: 1 }, 'raider')).toEqual({ kind: 'cancel' });
    expect(resolveDuelTap({ x: 1, z: -0.2 }, 'raider')).toEqual({ kind: 'cancel' });
    expect(resolveDuelTap(null, 'raider')).toEqual({ kind: 'cancel' });
    expect(resolveDuelTap({ x: 1, z: 1 }, null)).toEqual({ kind: 'cancel' });
  });
});
