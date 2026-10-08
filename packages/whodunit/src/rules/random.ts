/**
 * Random source for the deal, the weapon placement, the dice, and guest names. The runtime injects
 * a crypto-backed one and tests a seeded one. Rules modules stay free of `node:` imports so the
 * client can bundle them.
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

/** Fisher–Yates on a copy. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** One six-sided die. */
export function rollDie(random: Random): number {
  return 1 + random.int(6);
}
