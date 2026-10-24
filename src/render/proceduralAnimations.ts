/**
 * Procedural animation timings and curves of spec 9.6, shared by every unit and
 * implemented in code (no Blender clips). Kept pure so the exact 9.6 timings and
 * keyframes are unit-tested without three.js or the DOM.
 *
 * The clips (idle, attack, produce, walk, eat, victory) come from the Blender rigs
 * and are played by `models.ts`; this module only describes the code animations.
 */

/** Spawn: drop from 1.5 units above, then squash/overshoot/settle (spec 9.6). */
export const SPAWN_DURATION_MS = 500;
export const SPAWN_DROP_HEIGHT = 1.5;
/** Part of the spawn animation spent falling; the rest is the landing squash (spec 9.6). */
export const SPAWN_FALL_FRACTION = 0.7;
/** Landing squash and overshoot of spec 9.6. */
export const SPAWN_SQUASH_XZ = 1.15;
export const SPAWN_SQUASH_Y = 0.75;
export const SPAWN_OVERSHOOT_XZ = 0.97;
export const SPAWN_OVERSHOOT_Y = 1.05;

/** Hit: flash 0.08 s (spec 9.2) plus a 0.15 s squash to 0.92 and back (spec 9.6). */
export const HIT_DURATION_MS = 150;
export const HIT_SQUASH_Y = 0.92;
export const HIT_SQUASH_XZ = 1.04;
export const HIT_FLASH_MS = 80;

/** Death: 0.4 s scale to 0 with a 180 degree spin, then the poof (spec 9.6). */
export const DEATH_DURATION_MS = 400;
export const DEATH_SPIN_RADIANS = Math.PI;
/** Fraction of the death animation at which the poof particle burst fires. */
export const DEATH_POOF_FRACTION = 0.8;

/** Merge: 0.5 s jump of 0.4 units, 360 degree spin, grow to the new star scale (spec 9.6). */
export const MERGE_DURATION_MS = 500;
export const MERGE_JUMP_HEIGHT = 0.4;
export const MERGE_SPIN_RADIANS = 2 * Math.PI;
/** Fraction of the merge animation at which the star burst fires. */
export const MERGE_BURST_FRACTION = 0.8;

/** Fraction of the spawn animation at which the dust ring fires (the landing). */
export const SPAWN_LANDING_FRACTION = SPAWN_FALL_FRACTION;

/**
 * Walk clip reference speed in tiles per second. The clip is authored for a
 * typical World 1 walker; playback scales linearly with the enemy's current
 * speed, so a Slow (x0.5) enemy walks and animates at half the rate (spec 9.6).
 * This is an animation reference, not a game balance number.
 */
export const WALK_CLIP_REFERENCE_SPEED = 0.25;
export const WALK_PLAYBACK_MIN = 0.35;
export const WALK_PLAYBACK_MAX = 2.5;

/** Eat clip time scale limits when matching the clip to the enemy's attack interval (spec 9.6). */
export const EAT_PLAYBACK_MIN = 0.5;
export const EAT_PLAYBACK_MAX = 2.5;

/** A scale pair: the horizontal (x/z) factor and the vertical (y) factor. */
export interface ScalePair {
  xz: number;
  y: number;
}

/** Clamps a value into the 0..1 range. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progress of an animation that started `elapsedMs` ago and lasts `durationMs`. */
export function animationProgress(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) {
    return 1;
  }
  return clamp01(elapsedMs / durationMs);
}

/** Smoothstep easing for the merge growth (0 at 0, 1 at 1). */
export function smoothstep(progress: number): number {
  const t = clamp01(progress);
  return t * t * (3 - 2 * t);
}

/** Vertical offset of the spawn drop at a spawn progress: 1.5 units above, easing to 0. */
export function spawnOffsetY(progress: number): number {
  const t = clamp01(progress);
  if (t >= SPAWN_FALL_FRACTION) {
    return 0;
  }
  const fall = 1 - t / SPAWN_FALL_FRACTION;
  return SPAWN_DROP_HEIGHT * fall * fall;
}

/** One keyframe of a scale curve. */
interface ScaleKey {
  readonly progress: number;
  readonly xz: number;
  readonly y: number;
}

/** Spec 9.6 spawn scale: normal drop, squash (y 0.75, x/z 1.15), overshoot 1.05, settle 1.0. */
const SPAWN_SCALE_KEYS: readonly ScaleKey[] = [
  { progress: 0, xz: 1, y: 1 },
  { progress: SPAWN_FALL_FRACTION, xz: 1, y: 1 },
  { progress: 0.78, xz: SPAWN_SQUASH_XZ, y: SPAWN_SQUASH_Y },
  { progress: 0.9, xz: SPAWN_OVERSHOOT_XZ, y: SPAWN_OVERSHOOT_Y },
  { progress: 1, xz: 1, y: 1 },
];

/** Spec 9.6 hit scale: 1 -> squash to 0.92 -> 1 over the 0.15 s hit animation. */
const HIT_SCALE_KEYS: readonly ScaleKey[] = [
  { progress: 0, xz: 1, y: 1 },
  { progress: 0.5, xz: HIT_SQUASH_XZ, y: HIT_SQUASH_Y },
  { progress: 1, xz: 1, y: 1 },
];

/** Samples a scale key list without allocating; writes into `out`. */
function sampleScale(keys: readonly ScaleKey[], progress: number, out: ScalePair): ScalePair {
  const t = clamp01(progress);
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index];
    if (next === undefined || t > next.progress) {
      continue;
    }
    const previous = keys[index - 1];
    if (previous === undefined) {
      break;
    }
    const span = next.progress - previous.progress;
    const blend = span > 0 ? (t - previous.progress) / span : 0;
    out.xz = previous.xz + (next.xz - previous.xz) * blend;
    out.y = previous.y + (next.y - previous.y) * blend;
    return out;
  }
  out.xz = 1;
  out.y = 1;
  return out;
}

/** Spawn scale at a spawn progress, written into `out` (spec 9.6). */
export function spawnScale(progress: number, out: ScalePair): ScalePair {
  return sampleScale(SPAWN_SCALE_KEYS, progress, out);
}

/** Hit squash at a hit progress, written into `out` (spec 9.6). */
export function hitScale(progress: number, out: ScalePair): ScalePair {
  return sampleScale(HIT_SCALE_KEYS, progress, out);
}

/** Death scale at a death progress: shrinks linearly to 0 (spec 9.6). */
export function deathScale(progress: number): number {
  return 1 - clamp01(progress);
}

/** Death spin at a death progress: 0 to 180 degrees (spec 9.6). */
export function deathSpin(progress: number): number {
  return DEATH_SPIN_RADIANS * clamp01(progress);
}

/** Merge jump height at a merge progress: 0.4 units up and back (spec 9.6). */
export function mergeJumpY(progress: number): number {
  return MERGE_JUMP_HEIGHT * Math.sin(Math.PI * clamp01(progress));
}

/** Merge spin at a merge progress: one full 360 degree turn (spec 9.6). */
export function mergeSpin(progress: number): number {
  return MERGE_SPIN_RADIANS * clamp01(progress);
}

/** Merge cross-fade between the old and new star scale (spec 9.6). */
export function mergeScale(progress: number, fromScale: number, toScale: number): number {
  return fromScale + (toScale - fromScale) * smoothstep(progress);
}

/**
 * Walk clip playback rate for the enemy's current speed (spec 9.6). Slow halves
 * the enemy speed, so the caller passes the already-halved speed and the walk
 * animation halves with it. Faster enemies animate faster, within a sane range.
 */
export function walkPlaybackRate(currentSpeed: number): number {
  if (!Number.isFinite(currentSpeed) || currentSpeed <= 0) {
    return 0;
  }
  const rate = currentSpeed / WALK_CLIP_REFERENCE_SPEED;
  return Math.min(WALK_PLAYBACK_MAX, Math.max(WALK_PLAYBACK_MIN, rate));
}

/**
 * Eat clip time scale so one loop matches the enemy's attack interval
 * (spec 9.6: the eat clip loops matching `attackInterval`).
 */
export function eatTimeScale(attackIntervalSeconds: number, clipDurationSeconds: number): number {
  if (!(attackIntervalSeconds > 0) || !(clipDurationSeconds > 0)) {
    return 1;
  }
  const scale = attackIntervalSeconds / clipDurationSeconds;
  return Math.min(EAT_PLAYBACK_MAX, Math.max(EAT_PLAYBACK_MIN, scale));
}
