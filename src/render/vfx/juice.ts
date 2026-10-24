/**
 * Pure rules of the spec 9.7 "juice" (issue #75): damage-number colours, motion
 * timings, screen-shake rules and the slow-motion values. Kept free of three.js so
 * the numbers are unit-tested without a renderer and the renderer reads them here.
 */

import { rules } from '../../data/rules';
import type { ArmorType, DamageType } from '../../sim/combat/damage';

/** Damage numbers float up this many units in their lifetime (spec 9.7). */
export const DAMAGE_NUMBER_RISE = 0.6;
/** Damage number lifetime in seconds (spec 9.7). */
export const DAMAGE_NUMBER_LIFE_S = 0.6;
/** Screen-shake amplitude in world units (spec 9.7). */
export const SHAKE_AMPLITUDE = 0.05;
/** Screen-shake duration in seconds (spec 9.7). */
export const SHAKE_DURATION_S = 0.15;
/** Slow-motion speed factor and duration when the final wave is cleared (spec 9.7). */
export const SLOW_MOTION_SCALE = 0.3;
export const SLOW_MOTION_DURATION_S = 0.6;
/** Health-bar width in world units (spec 9.7). */
export const HEALTH_BAR_WIDTH = 0.6;
/** A hit at or above this amount shakes the screen (spec 9.7). */
export const SHAKE_HIT_THRESHOLD = 200;

/** Damage-number colours of spec 4.1: yellow effective, white neutral, grey resisted. */
export const DAMAGE_COLOR_EFFECTIVE = 0xffcc00;
export const DAMAGE_COLOR_NEUTRAL = 0xffffff;
export const DAMAGE_COLOR_RESISTED = 0x9aa0b0;

/** The 4.1 damage-type vs armor-type multiplier for a hit. */
export function damageMultiplierFor(damageType: DamageType, armor: ArmorType): number {
  return rules.combat.damageMultipliers[damageType][armor];
}

/** Damage-number colour for a 4.1 multiplier: >1 yellow, 1 white, <1 grey. */
export function damageColorFor(multiplier: number): number {
  if (multiplier > 1) {
    return DAMAGE_COLOR_EFFECTIVE;
  }
  if (multiplier < 1) {
    return DAMAGE_COLOR_RESISTED;
  }
  return DAMAGE_COLOR_NEUTRAL;
}

/** Health-bar fill fraction, clamped to 0..1. */
export function healthFraction(hp: number, maxHp: number): number {
  if (!(maxHp > 0) || !Number.isFinite(hp)) {
    return 0;
  }
  return Math.min(1, Math.max(0, hp / maxHp));
}

/** Slow motion reduces the simulation speed only; the HUD speed toggle stays 1x/2x. */
export function slowMotionSpeed(speed: number): number {
  return speed * SLOW_MOTION_SCALE;
}
