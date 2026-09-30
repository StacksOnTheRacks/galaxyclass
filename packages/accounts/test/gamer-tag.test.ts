import { describe, expect, it } from 'vitest';
import {
  GAMER_TAG_MAX_LENGTH,
  GAMER_TAG_MESSAGES,
  gamerTagKey,
  validateGamerTag,
} from '../src/gamer-tag.js';

describe('validateGamerTag', () => {
  it.each(['Ace', 'ace_of-Spades', 'P1a', 'x9y', '007', 'A'.repeat(GAMER_TAG_MAX_LENGTH), '  River_Rat  '])(
    'accepts %j',
    (raw) => {
      const result = validateGamerTag(raw);
      expect(result.ok).toBe(true);
    },
  );

  it('trims whitespace and keeps the chosen casing with a lowercase key', () => {
    expect(validateGamerTag('  River_Rat ')).toEqual({ ok: true, value: 'River_Rat', key: 'river_rat' });
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['   ', 'required'],
    ['ab', 'too_short'],
    ['A'.repeat(GAMER_TAG_MAX_LENGTH + 1), 'too_long'],
    ['ace spades', 'invalid_characters'],
    ['ace.spades', 'invalid_characters'],
    ['açe', 'invalid_characters'],
    ['player@example.com', 'invalid_characters'],
    ['_ace', 'invalid_edges'],
    ['ace-', 'invalid_edges'],
    ['ace__spades', 'repeated_separators'],
    ['ace-_spades', 'repeated_separators'],
    ['Admin', 'reserved'],
    ['galaxy_class', 'reserved'],
    ['Gala-xyClass', 'reserved'],
  ] as const)('rejects %j as %s', (raw, error) => {
    expect(validateGamerTag(raw)).toEqual({ ok: false, error });
  });

  it('has a message for every error', () => {
    for (const message of Object.values(GAMER_TAG_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('keys tags case-insensitively', () => {
    expect(gamerTagKey('AceOfSpades')).toBe(gamerTagKey('aceofspades'));
  });
});
