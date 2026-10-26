import { describe, expect, it } from 'vitest';

import { createDefaultSave } from '../../src/meta/save';
import { levelCards } from '../../src/ui/screens/levelCards';
import type { ShellLevel } from '../../src/ui/screens/shellTypes';

// Issue #113 / M4: the level select shows the ten World 1 levels, marks unknown
// ids as unavailable instead of crashing and locks levels behind the campaign path.

const DATE = '2026-10-26';

const LEVELS: readonly ShellLevel[] = [
  { id: 'w1_l01', name: 'First Light', index: 1 },
  { id: 'w1_l02', name: 'Village Path', index: 2 },
  { id: 'unknown_level', name: 'Mystery Gate', index: 3 },
];

describe('levelCards', () => {
  it('keeps order, names and level numbers', () => {
    const cards = levelCards(LEVELS, createDefaultSave(DATE));
    expect(cards.map((card) => card.number)).toEqual([1, 2, 3]);
    expect(cards.map((card) => card.name)).toEqual(['First Light', 'Village Path', 'Mystery Gate']);
  });

  it('marks ids without a data definition as unavailable', () => {
    const cards = levelCards(LEVELS, createDefaultSave(DATE));
    expect(cards.map((card) => card.available)).toEqual([true, true, false]);
  });

  it('unlocks the first level and the level after a cleared one', () => {
    const fresh = createDefaultSave(DATE);
    expect(levelCards(LEVELS, fresh).map((card) => card.unlocked)).toEqual([true, false, false]);

    const progressed = createDefaultSave(DATE);
    progressed.levels['w1_l01'] = { stars: 2 };
    expect(levelCards(LEVELS, progressed).map((card) => card.unlocked)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('marks only the first unlocked unplayed level as next', () => {
    const progressed = createDefaultSave(DATE);
    progressed.levels['w1_l01'] = { stars: 3 };
    expect(levelCards(LEVELS, progressed).find((card) => card.next)?.id).toBe('w1_l02');

    progressed.levels['w1_l02'] = { stars: 1 };
    const cards = levelCards(LEVELS, progressed);
    expect(cards.map((card) => card.stars)).toEqual([3, 1, 0]);
    expect(cards.some((card) => card.next)).toBe(false);
  });

  it('handles an empty level list', () => {
    expect(levelCards([], createDefaultSave(DATE))).toEqual([]);
  });
});
