import { describe, expect, it } from 'vitest';

import { rules } from '../src/data/rules';
import { advance } from '../src/loop';

/** One fixed tick in seconds, from the data rules (spec 3.2). */
const TICK_SECONDS = 1 / rules.tick.tickRate;

describe('fixed-tick accumulator (spec 11.4, 3.2)', () => {
  it('11.4: 30 tick-length frames at 1x speed produce exactly 30 ticks', () => {
    let accumulatorSeconds = 0;
    let ticks = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      const result = advance(accumulatorSeconds, TICK_SECONDS, 1);
      accumulatorSeconds = result.accumulatorSeconds;
      ticks += result.ticks;
    }
    expect(ticks).toBe(30);
    expect(accumulatorSeconds).toBeLessThan(TICK_SECONDS);
  });

  it('11.4: one tick-length frame steps exactly one tick at 1x speed', () => {
    expect(advance(0, TICK_SECONDS, 1).ticks).toBe(1);
  });

  it('3.2: 2x speed runs two ticks per tick-length frame', () => {
    expect(advance(0, TICK_SECONDS, 2).ticks).toBe(2);
  });

  it('3.2: pause (speed 0) steps no ticks and keeps the accumulator', () => {
    const paused = advance(0.01, 0.25, 0);
    expect(paused.ticks).toBe(0);
    expect(paused.accumulatorSeconds).toBeCloseTo(0.01);
  });

  it('11.4: the frame delta is capped at 0.25 s (spiral of death)', () => {
    const capped = advance(0, 0.25, 1);
    const runaway = advance(0, 30, 1);
    expect(runaway.ticks).toBe(capped.ticks);
    expect(runaway.alpha).toBeCloseTo(capped.alpha);
  });

  it('3.2: at 2x speed the 0.25 s cap allows at most 15 ticks', () => {
    expect(advance(0, 30, 2).ticks).toBe(15);
  });

  it('11.4: sub-tick frames accumulate until a whole tick is reached', () => {
    const half = advance(0, TICK_SECONDS / 2, 1);
    expect(half.ticks).toBe(0);
    expect(half.alpha).toBeCloseTo(0.5);
    const whole = advance(half.accumulatorSeconds, TICK_SECONDS / 2, 1);
    expect(whole.ticks).toBe(1);
    expect(whole.alpha).toBeCloseTo(0);
  });

  it('11.4: alpha always lies in [0, 1)', () => {
    for (const frameDelta of [0, TICK_SECONDS / 3, TICK_SECONDS, 0.1, 0.25]) {
      for (const speed of [0, 1, 2]) {
        const result = advance(0.0001, frameDelta, speed);
        expect(result.alpha).toBeGreaterThanOrEqual(0);
        expect(result.alpha).toBeLessThan(1);
      }
    }
  });

  it('11.4: a negative frame delta (clock reset) adds no time', () => {
    expect(advance(0.005, -1, 1).ticks).toBe(0);
  });
});
