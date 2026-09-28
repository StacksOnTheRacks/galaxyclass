import { validateDisplayName } from '../../shared/display-name.js';

const ADJECTIVES = [
  'Lucky', 'Brave', 'Clever', 'Swift', 'Quiet', 'Bold', 'Cosmic', 'Sly', 'Jolly', 'Wild',
  'Sunny', 'Stellar', 'Mellow', 'Nimble', 'Rapid', 'Steady', 'Witty', 'Frosty', 'Golden', 'Lunar',
] as const;

const NOUNS = [
  'Otter', 'Falcon', 'Badger', 'Comet', 'Fox', 'Panda', 'Raven', 'Tiger', 'Heron', 'Lynx',
  'Walrus', 'Gecko', 'Moose', 'Orca', 'Koala', 'Puffin', 'Bison', 'Marten', 'Wombat', 'Ibis',
] as const;

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

/** A friendly table name like "Lucky Otter" that no one else at the table is using. */
export function randomDisplayName(
  taken: Iterable<string> = [],
  random: () => number = Math.random,
): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const name = `${pick(ADJECTIVES, random)} ${pick(NOUNS, random)}`;
    if (!used.has(name.toLowerCase()) && validateDisplayName(name).ok) {
      return name;
    }
  }
  const suffix = Math.floor(random() * 900) + 100;
  return `${pick(NOUNS, random)} ${suffix}`;
}
