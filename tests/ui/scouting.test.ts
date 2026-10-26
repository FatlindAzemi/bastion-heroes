import { describe, expect, it } from 'vitest';

import { levelById } from '../../src/data';
import { LevelDef } from '../../src/data/schemas';
import {
  armorTypesForLevel,
  counterHintsForLevel,
  enemyTypesForLevel,
  laneSummary,
  terrainSummary,
} from '../../src/ui/screens/scouting';

/** Parses a registered level exactly like the boot path does (spec 7.1). */
function parsedLevel(levelId: string): LevelDef {
  const level = levelById[levelId];
  if (level === undefined) {
    throw new Error(`test setup: level "${levelId}" is not registered`);
  }
  return LevelDef.parse(level);
}

describe('Scouting helpers (spec 3.12 rule 1, issue #49)', () => {
  it('3.12: enemy types appear once, in first-appearance order', () => {
    expect(enemyTypesForLevel(parsedLevel('w1_l05')).map((enemy) => enemy.id)).toEqual([
      'gloomling',
      'shieldbearer',
      'pothead',
    ]);
  });

  it('3.12: armor types are unique and follow the enemy order', () => {
    expect(armorTypesForLevel(parsedLevel('w1_l06'))).toEqual(['light', 'spectral', 'armored']);
  });

  it('3.12: the lane summary comes from the level data and is shown 1-based', () => {
    expect(laneSummary(parsedLevel('w1_l02'))).toBe('3 of 5 lanes (2, 3, 4)');
    expect(laneSummary(parsedLevel('w1_l05'))).toBe('All 5 lanes open');
  });

  it('3.12: the terrain summary describes the level terrain overrides', () => {
    expect(terrainSummary(parsedLevel('w1_l05'))).toBe('Open ground, no obstacles');
  });

  it('4.1: counter hints pick the strongest damage type per armor from the rules table', () => {
    const hints = counterHintsForLevel(parsedLevel('w1_l05'));
    expect(hints).toEqual([
      { armor: 'light', damageType: 'pierce', multiplier: 1.25 },
      { armor: 'armored', damageType: 'blast', multiplier: 1.25 },
    ]);
    expect(counterHintsForLevel(parsedLevel('w1_l06'))).toEqual([
      { armor: 'light', damageType: 'pierce', multiplier: 1.25 },
      { armor: 'spectral', damageType: 'arcane', multiplier: 1.5 },
      { armor: 'armored', damageType: 'blast', multiplier: 1.25 },
    ]);
  });
});
