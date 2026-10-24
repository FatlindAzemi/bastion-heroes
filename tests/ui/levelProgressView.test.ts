import { describe, expect, it } from 'vitest';

import { levelById } from '../../src/data';
import { LevelDef } from '../../src/data/schemas';
import { levelProgressView } from '../../src/ui/hud/levelProgressView';

/** Parses a registered level exactly like the boot path does (spec 7.1). */
function parsedLevel(levelId: string): LevelDef {
  const level = levelById[levelId];
  if (level === undefined) {
    throw new Error(`test setup: level "${levelId}" is not registered`);
  }
  return LevelDef.parse(level);
}

/** Wave flags of a level, in wave order (spec 7.1). */
function waveFlags(levelId: string): readonly ('none' | 'big' | 'final')[] {
  return parsedLevel(levelId).waves.map((wave) => wave.flag);
}

describe('HUD level progress (spec 9.8, 3.10; issue #76)', () => {
  it('3.10: W1-L05 gets a flag for its BIG wave and a skull for the final wave', () => {
    const progress = levelProgressView(waveFlags('w1_l05'), 0, 'playing');
    // W1-L05 has six waves: index 3 is BIG, index 5 is FINAL.
    expect(progress.marks).toEqual([
      { fraction: 3 / 6, kind: 'big' },
      { fraction: 5 / 6, kind: 'final' },
    ]);
  });

  it('9.8: the fill follows the started waves and is empty before the first wave', () => {
    expect(levelProgressView(waveFlags('w1_l05'), -1, 'playing').fillFraction).toBe(0);
    expect(levelProgressView(waveFlags('w1_l05'), 3, 'playing').fillFraction).toBeCloseTo(0.5);
    expect(levelProgressView(waveFlags('w1_l05'), 5, 'playing').fillFraction).toBeCloseTo(5 / 6);
  });

  it('9.8: a won level fills the bar and a lost level keeps the reached progress', () => {
    expect(levelProgressView(waveFlags('w1_l05'), 5, 'won').fillFraction).toBe(1);
    expect(levelProgressView(waveFlags('w1_l05'), 2, 'lost').fillFraction).toBeCloseTo(2 / 6);
  });

  it('9.8: a level without BIG waves only gets the final-wave skull', () => {
    // W1-L01 has five normal waves and a final wave (spec 7.2 row 1).
    const progress = levelProgressView(waveFlags('w1_l01'), 0, 'playing');
    expect(progress.marks).toEqual([{ fraction: 4 / 5, kind: 'final' }]);
  });

  it('9.8: an empty wave list is safe and produces no marks', () => {
    expect(levelProgressView([], -1, 'playing')).toEqual({ fillFraction: 0, marks: [] });
  });
});
