import type { Rng } from './types';

/** Increment of the reference mulberry32 generator. */
const MULBERRY32_INCREMENT = 0x6d2b79f5;

/**
 * Creates the seeded mulberry32 generator (spec 3.2, 11.3). The same seed always
 * produces the same sequence, which makes replays deterministic (spec 11.6).
 * The simulation must use this generator instead of `Math.random`.
 */
export function createRng(seed: number): Rng {
  let state = seed;
  return {
    get state(): number {
      return state;
    },
    set state(nextState: number) {
      state = nextState;
    },
    next(): number {
      state += MULBERRY32_INCREMENT;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
