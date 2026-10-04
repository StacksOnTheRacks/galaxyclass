import type { Random } from '../rules/bag.js';

const ADJECTIVES = [
  'Clever', 'Witty', 'Nimble', 'Lucky', 'Cosmic', 'Mellow', 'Quick', 'Jolly', 'Sunny', 'Bold',
  'Curious', 'Gentle', 'Lunar', 'Brisk', 'Merry', 'Zesty', 'Plucky', 'Quiet', 'Stellar', 'Dapper',
] as const;

const NOUNS = [
  'Quill', 'Vowel', 'Glyph', 'Serif', 'Riddle', 'Rhyme', 'Sonnet', 'Comma', 'Lexicon', 'Scroll',
  'Haiku', 'Fable', 'Inkwell', 'Cipher', 'Verse', 'Parcel', 'Letter', 'Syllable', 'Ballad', 'Index',
] as const;

/**
 * A guest name like "Clever Quill" that nobody else at the table is using.
 * Guest names always contain a space, which gamer tags never do, so a guest
 * can never appear under a Galaxy Class account's tag.
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
