import { randomInt } from 'node:crypto';
import type { Rng } from '../../rules/types.js';

export function createCryptoRng(): Rng {
  return {
    nextInt(maxExclusive: number): number {
      return randomInt(maxExclusive);
    },
  };
}
