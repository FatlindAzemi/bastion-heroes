import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/sim/rng';

// Spec 3.2 / 11.3: the simulation uses one seeded mulberry32 generator so that
// the same seed and inputs always produce the same result.
describe('mulberry32 rng', () => {
  it('3.2: two generators with the same seed produce the same sequence', () => {
    const first = createRng(12345);
    const second = createRng(12345);

    for (let i = 0; i < 100; i += 1) {
      expect(second.next()).toBe(first.next());
    }
  });

  it('3.2: different seeds produce different sequences', () => {
    const first = createRng(1);
    const second = createRng(2);

    expect(second.next()).not.toBe(first.next());
  });

  it('3.2: next() returns a float in [0, 1)', () => {
    const rng = createRng(7);

    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('3.2: the sequence matches the reference mulberry32 implementation', () => {
    const rng = createRng(42);

    // Reference values of the canonical mulberry32 generator for seed 42.
    expect(rng.next()).toBe(0.6011037519201636);
    expect(rng.next()).toBe(0.44829055899754167);
    expect(rng.next()).toBe(0.8524657934904099);
  });

  it('11.6: restoring the state replays the same sequence', () => {
    const rng = createRng(999);
    rng.next();
    rng.next();

    const savedState = rng.state;
    const expected = [rng.next(), rng.next(), rng.next()];

    rng.state = savedState;
    expect([rng.next(), rng.next(), rng.next()]).toEqual(expected);
  });
});
