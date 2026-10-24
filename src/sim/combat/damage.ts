import { rules } from '../../data';

/** A damage type of the spec 4.1 table. */
export type DamageType = 'pierce' | 'blast' | 'arcane';

/** An armor type of the spec 4.1 table. */
export type ArmorType = 'light' | 'armored' | 'spectral';

/** The input of the spec 4.2 damage formula. */
export interface DamageInput {
  /** B: the defender's base damage from section 5. */
  readonly baseDamage: number;
  /** Card level 1-10; L = 1 + 0.08 * (cardLevel - 1). */
  readonly cardLevel: number;
  /** Star level; S = 1.0, 1.6 or 2.5 (spec 3.6, 4.2). */
  readonly stars: 1 | 2 | 3;
  /** Damage type of the hit; T is looked up with it in the 4.1 table. */
  readonly damageType: DamageType;
  /** Armor type of the target; the other half of the T lookup. */
  readonly armor: ArmorType;
  /** Active damage buffs (sum of decimals). No aura sources exist in M1, so it is 0. */
  readonly buffs?: readonly number[];
}

/** Card level multiplier L = 1 + 0.08 * (cardLevel - 1) (spec 4.2). */
function cardLevelMultiplier(cardLevel: number): number {
  return 1 + rules.combat.cardLevelMultiplierPerLevel * (cardLevel - 1);
}

/** Star multiplier S: 1.0 / 1.6 / 2.5 (spec 3.6, 4.2). */
function starMultiplier(stars: 1 | 2 | 3): number {
  if (stars === 2) {
    return rules.merge.star2DamageMultiplier;
  }
  if (stars === 3) {
    return rules.merge.star3DamageMultiplier;
  }
  return 1;
}

/** Damage type vs armor multiplier T from the 4.1 table. */
function typeMultiplier(damageType: DamageType, armor: ArmorType): number {
  return rules.combat.damageMultipliers[damageType][armor];
}

/** Pre-armor damage B * L * S * (1 + sum(buffs)) of one hit (spec 4.2). */
export function calculatePreArmorDamage(
  baseDamage: number,
  cardLevel: number,
  stars: 1 | 2 | 3,
  buffs: readonly number[] = [],
): number {
  const buffSum = buffs.reduce((sum, buff) => sum + buff, 0);
  return baseDamage * cardLevelMultiplier(cardLevel) * starMultiplier(stars) * (1 + buffSum);
}

/** Applies T and rounds up to the minimum damage of 1 (spec 4.1, 4.2). */
export function applyArmorMultiplier(
  preArmorDamage: number,
  damageType: DamageType,
  armor: ArmorType,
): number {
  return Math.max(
    rules.combat.minimumDamage,
    Math.round(preArmorDamage * typeMultiplier(damageType, armor)),
  );
}

/**
 * Scales one rounded hit down (e.g. the 50 % splash damage of 4.3), keeping the
 * minimum damage of the formula (spec 4.2).
 */
export function scaleDamage(amount: number, ratio: number): number {
  return Math.max(rules.combat.minimumDamage, Math.round(amount * ratio));
}

/** One hit: damage = max(1, round(B * L * S * T * (1 + sum(buffs)))) (spec 4.2). */
export function calculateDamage(input: DamageInput): number {
  return applyArmorMultiplier(
    calculatePreArmorDamage(input.baseDamage, input.cardLevel, input.stars, input.buffs ?? []),
    input.damageType,
    input.armor,
  );
}
