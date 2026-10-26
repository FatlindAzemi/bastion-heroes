/**
 * Deterministic seeded random generator for the meta layer (chest rolls and
 * daily quest draws, spec 8.4, 8.5). The sim has its own copy; `src/meta/` may
 * not import `src/sim/` (spec 10.4), so this small mulberry32 lives here.
 */

/** Returns a mulberry32 generator for a 32-bit seed, values in [0, 1). */
export function createMetaRng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes a string into a 32-bit seed (FNV-1a), so a date or level id works as a seed. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
