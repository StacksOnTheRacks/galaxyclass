import { randomInt } from 'node:crypto';
import type { Random } from '../rules/random.js';

/** Production source for the deal, the dice, the first detective, and guest names. */
export const cryptoRandom: Random = {
  int: (max) => randomInt(max),
};
