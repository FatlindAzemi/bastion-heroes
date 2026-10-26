/**
 * Pure rules of the spec 9.7 "juice" (issue #75) and the 2.5D relaunch of issue
 * #114 §3: damage-number colours and motion, the AOE ring/shockwave timing, the
 * target progress rings and the screen-shake / slow-motion values. Kept free of
 * three.js and of the simulation so every number is unit-tested without a renderer
 * and the renderer reads the same values.
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
/** Raised outline colour of the numbers and popups (spec 9.8: #1B1B2F). */
export const TEXT_OUTLINE_COLOR = 0x1b1b2f;

/** Simulation tick rate; the rings map absolute ticks to 0..1 progress with it. */
export const TICK_RATE = rules.tick.tickRate;

/**
 * Damage-number colour per damage type (issue #114 §3, 2.5D relaunch): pierce cyan,
 * blast orange, arcane violet. The 4.1 effectiveness is signalled on top of the
 * type colour by the `damageNumberColor` mix (bright for Effective, grey for
 * Resisted), so both rules are visible at a glance.
 */
export const DAMAGE_TYPE_COLORS: Readonly<Record<DamageType, number>> = {
  pierce: 0x22d3ee,
  blast: 0xff8a2b,
  arcane: 0x7c4dff,
};

/** A hit of at least this amount draws a bigger damage number (presentation only). */
export const DAMAGE_NUMBER_BIG_THRESHOLD = 100;
/** Extra size of a critical hit number (issue #114: crits pop bigger). */
export const DAMAGE_NUMBER_CRIT_SCALE = 1.35;
/** Extra size of a big (>= 200) hit number. */
export const DAMAGE_NUMBER_BIG_SCALE = 1.2;
/** Largest combined number scale so a crit + big hit stays readable. */
export const DAMAGE_NUMBER_MAX_SCALE = 1.6;

/** Damage numbers pop in from this scale and overshoot to sell the impact. */
export const DAMAGE_NUMBER_POP_START = 0.35;
export const DAMAGE_NUMBER_POP_OVERSHOOT = 1.18;
/** Part of the lifetime (0..1) spent popping up to the overshoot scale. */
const DAMAGE_NUMBER_POP_IN = 0.16;
/** Part of the lifetime (0..1) used to settle the overshoot back to 1. */
const DAMAGE_NUMBER_POP_SETTLE = 0.38;
/** Part of the lifetime (0..1) after which the number fades out. */
const DAMAGE_NUMBER_FADE_START = 0.55;

/** AOE rings of the 2.5D relaunch (issue #114 §3): neon emerald / violet / gold. */
export const AOE_COLORS = {
  blast: 0xff8a2b,
  emerald: 0x2dffa0,
  gold: 0xffcc00,
  violet: 0xa64dff,
  white: 0xffffff,
} as const;

/** Lifetime and fade start of the flat ground rings (seconds). */
export const AOE_GROUND_LIFE_S = 0.5;
export const AOE_GROUND_FADE_START = 0.35;
/** Lifetime and fade start of the expanding energy shockwaves (seconds). */
export const AOE_SHOCKWAVE_LIFE_S = 0.3;
export const AOE_SHOCKWAVE_FADE_START = 0.2;

/** Target progress rings over defenders (issue #114 §3). */
export const TARGET_RING_LIFT = 0.5;
export const TARGET_RING_RADIUS = 0.22;
/** Rings are hidden right after an action and stay readable while charging. */
export const TARGET_RING_MIN_PROGRESS = 0.06;
/** Colour of the defender attack cooldown ring (spec 9.4 Neon Arcana cyan). */
export const TARGET_RING_ATTACK_COLOR = 0x22d3ee;
/** Colour of the producer orb ring (spec 9.4 Essence teal). */
export const TARGET_RING_ORB_COLOR = 0x3bf0c8;

/** White impact flash overlay of a hit (issue #114: punchier white hit flash). */
export const IMPACT_FLASH_LIFE_S = 0.18;

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

/** Linear mix of two 0xRRGGBB colours, `amount` 0 = from, 1 = to. */
export function mixColor(from: number, to: number, amount: number): number {
  const t = Math.min(1, Math.max(0, amount));
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;
  const r = Math.round(fromR + (toR - fromR) * t);
  const g = Math.round(fromG + (toG - fromG) * t);
  const b = Math.round(fromB + (toB - fromB) * t);
  return (r << 16) | (g << 8) | b;
}

/** Scales every channel of a 0xRRGGBB colour by `amount` and clamps to 0..255. */
export function scaleColor(color: number, amount: number): number {
  const factor = Math.max(0, amount);
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/**
 * Damage-number colour of one hit: the 114 §3 damage-type colour, mixed towards
 * white for an effective 4.1 hit and desaturated + dimmed for a resisted one.
 * Neutral hits keep the pure type colour.
 */
export function damageNumberColor(damageType: DamageType, multiplier: number): number {
  const base = DAMAGE_TYPE_COLORS[damageType];
  if (multiplier > 1) {
    return mixColor(base, DAMAGE_COLOR_NEUTRAL, 0.28);
  }
  if (multiplier < 1) {
    return scaleColor(mixColor(base, DAMAGE_COLOR_RESISTED, 0.55), 0.82);
  }
  return base;
}

/** Size multiplier of one damage number: crits and big hits pop bigger. */
export function damageNumberScaleMultiplier(amount: number, crit: boolean): number {
  let scale = 1;
  if (amount >= SHAKE_HIT_THRESHOLD) {
    scale = DAMAGE_NUMBER_BIG_SCALE * 1.15;
  } else if (amount >= DAMAGE_NUMBER_BIG_THRESHOLD) {
    scale = DAMAGE_NUMBER_BIG_SCALE;
  }
  if (crit) {
    scale *= DAMAGE_NUMBER_CRIT_SCALE;
  }
  return Math.min(DAMAGE_NUMBER_MAX_SCALE, scale);
}

/** Pop-in scale of a damage number at lifetime progress 0..1 (overshoot included). */
export function damageNumberPopScale(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  if (t < DAMAGE_NUMBER_POP_IN) {
    return lerp(DAMAGE_NUMBER_POP_START, DAMAGE_NUMBER_POP_OVERSHOOT, t / DAMAGE_NUMBER_POP_IN);
  }
  if (t < DAMAGE_NUMBER_POP_SETTLE) {
    const settle = (t - DAMAGE_NUMBER_POP_IN) / (DAMAGE_NUMBER_POP_SETTLE - DAMAGE_NUMBER_POP_IN);
    return lerp(DAMAGE_NUMBER_POP_OVERSHOOT, 1, settle);
  }
  return 1;
}

/** Rise of a damage number in world units at lifetime progress 0..1 (ease-out). */
export function damageNumberRise(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - t) * (1 - t);
  return DAMAGE_NUMBER_RISE * eased;
}

/** Opacity of a damage number at lifetime progress 0..1: opaque, then fade out. */
export function damageNumberAlpha(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  if (t <= DAMAGE_NUMBER_FADE_START) {
    return 1;
  }
  return clamp01((1 - t) / (1 - DAMAGE_NUMBER_FADE_START));
}

/** Expansion of a ground ring / shockwave at progress 0..1 (fast out, slow tail). */
export function aoeRingScale(progress: number, startScale: number, endScale: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return startScale + (endScale - startScale) * eased;
}

/** Opacity of an AOE ring at progress 0..1: hold, then fade to zero. */
export function aoeRingAlpha(progress: number, fadeStart: number): number {
  const t = Math.min(1, Math.max(0, progress));
  if (t <= fadeStart) {
    return 1;
  }
  return clamp01((1 - t) / Math.max(0.001, 1 - fadeStart));
}

/**
 * Progress 0..1 of an action cooldown: 0 right after the action, 1 when ready.
 * `intervalTicks` must be the full cycle length; invalid data returns 0.
 */
export function cooldownProgress(
  nextTick: number,
  currentTick: number,
  intervalTicks: number,
): number {
  if (!(intervalTicks > 0) || !Number.isFinite(nextTick) || !Number.isFinite(currentTick)) {
    return 0;
  }
  const remaining = Math.max(0, nextTick - currentTick);
  return clamp01(1 - remaining / intervalTicks);
}

/** Scale of the white impact flash at progress 0..1 (snaps out fast). */
export function impactFlashScale(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 0.55 + (1.35 - 0.55) * (1 - (1 - t) * (1 - t));
}

/** Opacity of the white impact flash at progress 0..1 (punchy, quick fade). */
export function impactFlashAlpha(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return clamp01((1 - t) * (1 - t));
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

/** Linear interpolation helper shared by the pure animation curves. */
function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Clamps a number into 0..1; non-finite input becomes 0. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
