import type { Random } from '../rules/random.js';

const ADJECTIVES = [
  'Quiet', 'Sly', 'Keen', 'Dapper', 'Shadowy', 'Curious', 'Nimble', 'Wry', 'Patient', 'Sharp',
  'Velvet', 'Midnight', 'Gilded', 'Silent', 'Clever', 'Lucky', 'Stellar', 'Nocturne', 'Plucky', 'Jolly',
] as const;

const NOUNS = [
  'Magnifier', 'Lantern', 'Footprint', 'Alibi', 'Cipher', 'Keyhole', 'Monocle', 'Candle', 'Raven', 'Ledger',
  'Hunch', 'Shadow', 'Riddle', 'Fedora', 'Pocketwatch', 'Inkwell', 'Staircase', 'Locket', 'Whisper', 'Owl',
] as const;

/**
 * A name like "Quiet Lantern" for a member who has not picked a gamer tag yet, unused at the table.
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
