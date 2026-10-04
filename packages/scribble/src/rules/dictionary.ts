import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Dictionary {
  has(word: string): boolean;
  readonly size: number;
}

export function createDictionary(text: string): Dictionary {
  const words = new Set<string>();
  for (const line of text.split('\n')) {
    const word = line.trim().toUpperCase();
    if (word) {
      words.add(word);
    }
  }
  return {
    has: (word) => words.has(word.toUpperCase()),
    get size() {
      return words.size;
    },
  };
}

/** The shipped ENABLE list, relative to this source file. The Lambda bundle sets DICTIONARY_PATH instead. */
export const DEFAULT_DICTIONARY_PATH = fileURLToPath(new URL('../../dictionary/enable1.txt', import.meta.url));

let cached: Dictionary | undefined;

export function loadDictionary(path: string = process.env.DICTIONARY_PATH ?? DEFAULT_DICTIONARY_PATH): Dictionary {
  if (!cached) {
    cached = createDictionary(readFileSync(path, 'utf8'));
  }
  return cached;
}
