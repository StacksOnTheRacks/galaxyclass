import { randomInt } from 'node:crypto';
import type { Random } from '../rules/random.js';

/** Production source for the opening coin flip and guest names. */
export const cryptoRandom: Random = {
  int: (max) => randomInt(max),
};
