import { randomBytes, randomInt } from 'node:crypto';
import { TILE_COUNTS } from './tiles.js';
import type { Tile } from './types.js';

/** Random source for shuffles and tile ids. Production uses crypto; tests inject a seeded one. */
export interface Random {
  /** Integer in [0, max). */
  int(max: number): number;
  /** Opaque id that reveals nothing about the tile's letter. */
  id(): string;
}

export const cryptoRandom: Random = {
  int: (max) => randomInt(max),
  id: () => randomBytes(6).toString('hex'),
};

/** Deterministic random for tests and the local dev harness. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  let counter = 0;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  return {
    int: (max) => Math.floor(next() * max),
    id: () => `t${(counter++).toString(36)}${Math.floor(next() * 0xffffff).toString(36)}`,
  };
}

export function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function createBag(random: Random): Tile[] {
  const tiles: Tile[] = [];
  for (const [letter, count] of TILE_COUNTS) {
    for (let i = 0; i < count; i++) {
      tiles.push({ id: random.id(), letter });
    }
  }
  return shuffle(tiles, random);
}

/** Draws up to `count` tiles from the front of the bag. */
export function draw(bag: Tile[], count: number): { drawn: Tile[]; bag: Tile[] } {
  const n = Math.max(0, Math.min(count, bag.length));
  return { drawn: bag.slice(0, n), bag: bag.slice(n) };
}
