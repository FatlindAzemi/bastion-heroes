import { describe, expect, it } from 'vitest';

import { rules } from '../../src/data';
import {
  calculateDamage,
  calculatePreArmorDamage,
  type DamageInput,
} from '../../src/sim/combat/damage';

/** Builds one hit of the 4.2 formula with the defaults used by the tests. */
function hit(overrides: Partial<DamageInput>): number {
  return calculateDamage({
    baseDamage: 20,
    cardLevel: 1,
    stars: 1,
    damageType: 'pierce',
    armor: 'light',
    ...overrides,
  });
}

// Spec 4.1 and 4.2: the 3x3 damage table and the damage formula.
describe('damage formula', () => {
  it('4.1: pierce is effective vs light, resisted vs armored, neutral vs spectral', () => {
    expect([
      hit({ armor: 'light' }),
      hit({ armor: 'armored' }),
      hit({ armor: 'spectral' }),
    ]).toEqual([25, 10, 20]);
  });

  it('4.1: blast is effective vs armored, resisted vs spectral, neutral vs light', () => {
    expect([
      hit({ damageType: 'blast', armor: 'light' }),
      hit({ damageType: 'blast', armor: 'armored' }),
      hit({ damageType: 'blast', armor: 'spectral' }),
    ]).toEqual([20, 25, 10]);
  });

  it('4.1: arcane is effective vs spectral, resisted vs light, neutral vs armored', () => {
    expect([
      hit({ damageType: 'arcane', armor: 'light' }),
      hit({ damageType: 'arcane', armor: 'armored' }),
      hit({ damageType: 'arcane', armor: 'spectral' }),
    ]).toEqual([15, 20, 30]);
  });

  it('4.2: the card level multiplier is 1 + 0.08 * (cardLevel - 1)', () => {
    expect(calculatePreArmorDamage(100, 1, 1)).toBeCloseTo(100);
    expect(calculatePreArmorDamage(100, 10, 1)).toBeCloseTo(172);
    expect(hit({ baseDamage: 100, cardLevel: 10 })).toBe(215);
  });

  it('4.2: the star multipliers are 1.6 for two stars and 2.5 for three stars', () => {
    expect(calculatePreArmorDamage(100, 1, 2)).toBeCloseTo(160);
    expect(calculatePreArmorDamage(100, 1, 3)).toBeCloseTo(250);
    expect(hit({ stars: 2 })).toBe(40);
    expect(hit({ stars: 3 })).toBe(63);
  });

  it('4.2: the result is rounded after all multipliers', () => {
    expect(hit({ baseDamage: 17 })).toBe(21);
    expect(hit({ baseDamage: 3, damageType: 'arcane' })).toBe(2);
  });

  it('4.2: a hit never deals less than the minimum damage of 1', () => {
    expect(rules.combat.minimumDamage).toBe(1);
    expect(hit({ baseDamage: 0, damageType: 'blast', armor: 'spectral' })).toBe(1);
  });

  it('4.2: active buffs are added to the multiplier before rounding', () => {
    expect(hit({ buffs: [0.2] })).toBe(30);
    expect(hit({ buffs: [0.1, 0.1] })).toBe(30);
  });
});
