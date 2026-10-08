/**
 * Random source for fleet randomizing and the opening coin flip. The runtime injects a crypto-backed
 * one, tests a seeded one, and the client a Math.random one for the Randomize button. Rules modules
 * stay free of `node:` imports so the client can bundle them.
 */
export interface Random {
  /** Integer in [0, max). */
  int(max: number): number;
}

/** Deterministic xorshift source for tests and the dev harness. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  return { int: (max) => Math.floor(next() * max) };
}

/** Non-cryptographic source for the client's Randomize button. */
export const mathRandom: Random = {
  int: (max) => Math.floor(Math.random() * max),
};
