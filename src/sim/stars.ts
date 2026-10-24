import type { DefenderDef } from '../data';
import { rules } from '../data';
import { cardLevelMultiplier } from './combat/damage';
import { ticksFromSeconds } from './time';
import type { DefenderState } from './types';

/** Highest star level a defender can reach (spec 3.6: ★1 to ★3). */
export const MAX_STARS = rules.merge.maxStars;

/** Star health multiplier S: 1.0 / 1.6 / 2.5 (spec 3.6, 4.2). */
export function starHealthMultiplier(stars: 1 | 2 | 3): number {
  if (stars === 2) {
    return rules.merge.star2HealthMultiplier;
  }
  if (stars === 3) {
    return rules.merge.star3HealthMultiplier;
  }
  return 1;
}

/** Model scale of a defender at its star level: 1.0 / 1.12 / 1.25 (spec 3.6). */
export function starModelScale(stars: 1 | 2 | 3): number {
  if (stars === 2) {
    return rules.merge.star2Scale;
  }
  if (stars === 3) {
    return rules.merge.star3Scale;
  }
  return 1;
}

/**
 * Full health of a defender at its card level and star level:
 * `baseHealth × L × S` (spec 4.2), rounded to whole health.
 */
export function defenderMaxHp(baseHp: number, cardLevel: number, stars: 1 | 2 | 3): number {
  return Math.round(baseHp * cardLevelMultiplier(cardLevel) * starHealthMultiplier(stars));
}

/** Producer interval divisor: ★2 divides by 1.5, ★3 by 2 (spec 3.6). */
function producerIntervalDivisor(stars: 1 | 2 | 3): number {
  if (stars === 3) {
    return rules.merge.producerStar3IntervalDivisor;
  }
  if (stars === 2) {
    return rules.merge.producerStar2IntervalDivisor;
  }
  return 1;
}

/** Ticks between two producer orbs at a star level: the base interval divided by 1.5 / 2 (spec 3.6). */
export function producerIntervalTicks(baseIntervalS: number, stars: 1 | 2 | 3): number {
  return Math.max(1, ticksFromSeconds(baseIntervalS / producerIntervalDivisor(stars)));
}

/**
 * Highest star level a defender definition allows. `maxStars: 1` is the seam for
 * defenders that cannot merge (Aurora, spec 5.2); M7 data sets it.
 */
export function maxStarsOf(defenderDef: DefenderDef): number {
  return defenderDef.maxStars ?? MAX_STARS;
}

/** True when placing the same defender on this tile is a merge: same id and below the max stars (spec 3.6). */
export function canMerge(defender: DefenderState, defenderDef: DefenderDef): boolean {
  return defender.defenderId === defenderDef.id && defender.stars < maxStarsOf(defenderDef);
}

/**
 * Rebases a pending producer orb timer when a merge shortens the interval
 * (spec 3.6): the remaining time scales with the new interval length, so a
 * half-finished timer stays half finished instead of firing early or late.
 */
export function rebaseProducerTimer(
  nextOrbTick: number,
  tick: number,
  baseIntervalS: number,
  previousStars: 1 | 2 | 3,
  stars: 1 | 2 | 3,
): number {
  const previousInterval = producerIntervalTicks(baseIntervalS, previousStars);
  const interval = producerIntervalTicks(baseIntervalS, stars);
  const remaining = Math.max(0, nextOrbTick - tick);
  return tick + Math.round((remaining * interval) / previousInterval);
}
