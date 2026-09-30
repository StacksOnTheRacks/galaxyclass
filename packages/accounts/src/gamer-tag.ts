/**
 * Galaxy Class gamer tag rules, shared by the studio site, the profile API,
 * the Cognito sign-up trigger, and games:
 *
 * - 3–20 characters after trimming surrounding whitespace.
 * - Letters A–Z, digits 0–9, underscore (_) and hyphen (-) only.
 * - Starts and ends with a letter or digit.
 * - Separators never sit next to each other ("a__b", "a-_b").
 * - Uniqueness is case-insensitive: the lowercase form is the ownership key,
 *   while the player's chosen casing is what everyone sees.
 * - A few staff/system words are reserved, compared with separators removed.
 */
export const GAMER_TAG_MIN_LENGTH = 3;
export const GAMER_TAG_MAX_LENGTH = 20;

const ALLOWED_CHARACTERS = /^[A-Za-z0-9_-]+$/;
const SEPARATOR = /[-_]/;
const REPEATED_SEPARATORS = /[-_]{2,}/;

const RESERVED = new Set([
  'admin',
  'administrator',
  'anonymous',
  'dealer',
  'galaxyclass',
  'guest',
  'help',
  'moderator',
  'null',
  'official',
  'riffle',
  'root',
  'staff',
  'support',
  'system',
  'undefined',
]);

export type GamerTagError =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'invalid_characters'
  | 'invalid_edges'
  | 'repeated_separators'
  | 'reserved';

export type GamerTagValidation =
  | { ok: true; value: string; key: string }
  | { ok: false; error: GamerTagError };

export const GAMER_TAG_RULE =
  '3–20 letters, numbers, _ or -. Start and end with a letter or number.';

export const GAMER_TAG_MESSAGES: Record<GamerTagError | 'taken', string> = {
  required: 'Enter a gamer tag.',
  too_short: `Gamer tag must be at least ${GAMER_TAG_MIN_LENGTH} characters.`,
  too_long: `Gamer tag must be ${GAMER_TAG_MAX_LENGTH} characters or fewer.`,
  invalid_characters: 'Use only letters, numbers, _ or -.',
  invalid_edges: 'Start and end with a letter or number.',
  repeated_separators: 'Don’t put _ or - next to each other.',
  reserved: 'That gamer tag is reserved. Pick another.',
  taken: 'That gamer tag is taken. Pick another.',
};

/** Ownership key: two tags that differ only by case are the same tag. */
export function gamerTagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

export function validateGamerTag(raw: unknown): GamerTagValidation {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'required' };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, error: 'required' };
  }
  if (!ALLOWED_CHARACTERS.test(value)) {
    return { ok: false, error: 'invalid_characters' };
  }
  if (value.length < GAMER_TAG_MIN_LENGTH) {
    return { ok: false, error: 'too_short' };
  }
  if (value.length > GAMER_TAG_MAX_LENGTH) {
    return { ok: false, error: 'too_long' };
  }
  if (SEPARATOR.test(value[0]!) || SEPARATOR.test(value[value.length - 1]!)) {
    return { ok: false, error: 'invalid_edges' };
  }
  if (REPEATED_SEPARATORS.test(value)) {
    return { ok: false, error: 'repeated_separators' };
  }
  const key = gamerTagKey(value);
  if (RESERVED.has(key.replace(/[-_]/g, ''))) {
    return { ok: false, error: 'reserved' };
  }
  return { ok: true, value, key };
}

export function gamerTagMessage(error: GamerTagError | 'taken'): string {
  return GAMER_TAG_MESSAGES[error];
}
