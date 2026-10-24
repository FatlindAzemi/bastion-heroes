import { describe, expect, it } from 'vitest';

import {
  animationProgress,
  deathScale,
  deathSpin,
  DEATH_SPIN_RADIANS,
  DEATH_DURATION_MS,
  eatTimeScale,
  HIT_DURATION_MS,
  HIT_SQUASH_Y,
  hitScale,
  MERGE_JUMP_HEIGHT,
  MERGE_SPIN_RADIANS,
  MERGE_DURATION_MS,
  mergeJumpY,
  mergeScale,
  mergeSpin,
  SPAWN_DROP_HEIGHT,
  SPAWN_DURATION_MS,
  SPAWN_SQUASH_XZ,
  SPAWN_SQUASH_Y,
  spawnOffsetY,
  spawnScale,
  walkPlaybackRate,
  type ScalePair,
} from '../../src/render/proceduralAnimations';

/** Reusable scale output, so the timing functions can be called without allocating. */
function scale(): ScalePair {
  return { xz: 1, y: 1 };
}

describe('Procedural animations (spec 9.6; issue #74)', () => {
  it('9.6: spawn falls from 1.5 units and lasts 0.5 s', () => {
    expect(SPAWN_DURATION_MS).toBe(500);
    expect(SPAWN_DROP_HEIGHT).toBe(1.5);
    expect(spawnOffsetY(0)).toBe(1.5);
    expect(spawnOffsetY(0.35)).toBeCloseTo(0.375);
    expect(spawnOffsetY(0.7)).toBe(0);
    expect(spawnOffsetY(1)).toBe(0);
  });

  it('9.6: spawn lands with squash (y 0.75, x/z 1.15), overshoots to 1.05 and settles at 1.0', () => {
    const animation = scale();
    spawnScale(0.78, animation);
    expect(animation.y).toBeCloseTo(0.75);
    expect(animation.xz).toBeCloseTo(1.15);
    spawnScale(0.9, animation);
    expect(animation.y).toBeCloseTo(1.05);
    spawnScale(1, animation);
    expect(animation.y).toBeCloseTo(1);
    expect(animation.xz).toBeCloseTo(1);
    expect(SPAWN_SQUASH_Y).toBe(0.75);
    expect(SPAWN_SQUASH_XZ).toBe(1.15);
  });

  it('9.6: hit lasts 0.15 s, squashes to 0.92 and returns', () => {
    expect(HIT_DURATION_MS).toBe(150);
    const animation = scale();
    hitScale(0.5, animation);
    expect(animation.y).toBeCloseTo(0.92);
    expect(animation.y).toBe(HIT_SQUASH_Y);
    hitScale(0, animation);
    expect(animation.y).toBe(1);
    hitScale(1, animation);
    expect(animation.y).toBe(1);
  });

  it('9.6: death lasts 0.4 s, shrinks to 0 and spins 180 degrees', () => {
    expect(DEATH_DURATION_MS).toBe(400);
    expect(deathScale(0)).toBe(1);
    expect(deathScale(0.5)).toBeCloseTo(0.5);
    expect(deathScale(1)).toBe(0);
    expect(deathSpin(0)).toBe(0);
    expect(deathSpin(1)).toBeCloseTo(DEATH_SPIN_RADIANS);
    expect(DEATH_SPIN_RADIANS).toBeCloseTo(Math.PI);
  });

  it('9.6: merge lasts 0.5 s with a 0.4 unit jump and a 360 degree spin', () => {
    expect(MERGE_DURATION_MS).toBe(500);
    expect(mergeJumpY(0)).toBe(0);
    expect(mergeJumpY(0.5)).toBeCloseTo(MERGE_JUMP_HEIGHT);
    expect(mergeJumpY(1)).toBeCloseTo(0);
    expect(mergeSpin(1)).toBeCloseTo(MERGE_SPIN_RADIANS);
    expect(MERGE_SPIN_RADIANS).toBeCloseTo(2 * Math.PI);
  });

  it('9.6: merge grows from the old to the new star scale', () => {
    expect(mergeScale(0, 1, 1.12)).toBeCloseTo(1);
    expect(mergeScale(1, 1, 1.12)).toBeCloseTo(1.12);
    expect(mergeScale(0.5, 1, 1.12)).toBeCloseTo(1.06);
  });

  it('9.6: walk playback scales with the current speed; Slow (x0.5) halves it', () => {
    expect(walkPlaybackRate(0.25)).toBeCloseTo(1);
    expect(walkPlaybackRate(0.5)).toBeCloseTo(2);
    // A 0.22 tiles/s Gloomling slowed to 0.11 walks at half the animation rate.
    expect(walkPlaybackRate(0.11)).toBeCloseTo(0.44);
    // Frozen/stunned enemies (current speed 0) stop the walk clip.
    expect(walkPlaybackRate(0)).toBe(0);
    // Extremely fast or invalid speeds stay in a sane animation range.
    expect(walkPlaybackRate(10)).toBeLessThanOrEqual(2.5);
    expect(walkPlaybackRate(-1)).toBe(0);
  });

  it('9.6: the eat clip time scale matches the enemy attack interval', () => {
    expect(eatTimeScale(0.5, 0.5)).toBeCloseTo(1);
    expect(eatTimeScale(1, 0.5)).toBeCloseTo(2);
    expect(eatTimeScale(0, 0.5)).toBe(1);
    expect(eatTimeScale(0.5, 0)).toBe(1);
  });

  it('9.6: animation progress clamps to its duration', () => {
    expect(animationProgress(-50, 500)).toBe(0);
    expect(animationProgress(250, 500)).toBeCloseTo(0.5);
    expect(animationProgress(900, 500)).toBe(1);
    expect(animationProgress(10, 0)).toBe(1);
  });
});
