import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDictionary, DEFAULT_DICTIONARY_PATH, loadDictionary } from '../../src/rules/dictionary.js';

describe('dictionary', () => {
  it('ships the pinned public-domain ENABLE list', () => {
    const bytes = readFileSync(DEFAULT_DICTIONARY_PATH);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89',
    );
    expect(loadDictionary().size).toBe(172_823);
  });

  it('matches words case-insensitively', () => {
    const dictionary = loadDictionary();
    expect(dictionary.has('CAT')).toBe(true);
    expect(dictionary.has('cat')).toBe(true);
    expect(dictionary.has('RETAINS')).toBe(true);
    expect(dictionary.has('QZX')).toBe(false);
    expect(dictionary.has('TX')).toBe(false);
  });

  it('ignores blank lines and CRLF', () => {
    const dictionary = createDictionary('aa\r\n\r\nbb\n');
    expect(dictionary.size).toBe(2);
    expect(dictionary.has('BB')).toBe(true);
  });
});
