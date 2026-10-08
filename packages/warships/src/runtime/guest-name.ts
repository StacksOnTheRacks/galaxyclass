import type { Random } from '../rules/random.js';

const ADJECTIVES = [
  'Steady', 'Salty', 'Brisk', 'Bold', 'Silent', 'Lucky', 'Stormy', 'Calm', 'Swift', 'Hardy',
  'Keen', 'Gallant', 'Sturdy', 'Nimble', 'Misty', 'Stellar', 'Quiet', 'Plucky', 'Dapper', 'Jolly',
] as const;

const NOUNS = [
  'Gull', 'Tide', 'Anchor', 'Compass', 'Harbor', 'Reef', 'Squall', 'Keel', 'Mast', 'Beacon',
  'Current', 'Lantern', 'Buoy', 'Helm', 'Starboard', 'Shoal', 'Breaker', 'Petrel', 'Sextant', 'Rudder',
] as const;

/**
 * A name like "Steady Gull" for a member who has not picked a gamer tag yet, unused at the table.
 * It always contains a space, which gamer tags never do, so it cannot pass for an account's tag.
 */
export function randomGuestName(taken: Iterable<string>, random: Random): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${ADJECTIVES[random.int(ADJECTIVES.length)]} ${NOUNS[random.int(NOUNS.length)]}`;
    if (!used.has(name.toLowerCase())) {
      return name;
    }
  }
  return `${NOUNS[random.int(NOUNS.length)]} ${100 + random.int(900)}`;
}
