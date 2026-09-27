import type { Rng } from './types.js';

/** mulberry32 — same seed yields the same nextInt stream. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  return {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new RangeError('maxExclusive must be an integer >= 1');
      }
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(u * maxExclusive);
    },
  };
}
