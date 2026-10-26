import { describe, expect, it } from 'vitest';

import {
  clearedLevelCount,
  isLevelUnlocked,
  nextLevelId,
  nextLevelToPlay,
  starsForLevel,
  totalStars,
} from '../../src/meta/progress';
import { createDefaultSave } from '../../src/meta/save';

const DATE = '2026-10-26';

describe('campaign progression', () => {
  it('starts with only the first level unlocked', () => {
    const save = createDefaultSave(DATE);
    expect(isLevelUnlocked(save, 'w1_l01')).toBe(true);
    expect(isLevelUnlocked(save, 'w1_l02')).toBe(false);
    expect(nextLevelToPlay(save)).toBe('w1_l01');
  });

  it('unlocks the next level after a clear', () => {
    const save = createDefaultSave(DATE);
    save.levels.w1_l01 = { stars: 2 };
    expect(isLevelUnlocked(save, 'w1_l02')).toBe(true);
    expect(isLevelUnlocked(save, 'w1_l03')).toBe(false);
    expect(nextLevelToPlay(save)).toBe('w1_l02');
  });

  it('counts stars and cleared levels', () => {
    const save = createDefaultSave(DATE);
    save.levels.w1_l01 = { stars: 3 };
    save.levels.w1_l02 = { stars: 1 };
    expect(totalStars(save)).toBe(4);
    expect(clearedLevelCount(save)).toBe(2);
    expect(starsForLevel(save, 'w1_l03')).toBe(0);
  });

  it('moves to the next level id and stops after level 10', () => {
    expect(nextLevelId('w1_l01')).toBe('w1_l02');
    expect(nextLevelId('w1_l09')).toBe('w1_l10');
    expect(nextLevelId('w1_l10')).toBeNull();
  });
});
