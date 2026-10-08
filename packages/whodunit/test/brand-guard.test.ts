import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

// Built from parts so this file never matches itself.
const FORBIDDEN = new RegExp(
  [
    'clue' + 'do',
    '\\bcl' + 'ue\\b',
    'has' + 'bro',
    'parker ' + 'brothers',
    'wadding' + 'tons',
    'scar' + 'lett?',
    'mus' + 'tard',
    'pea' + 'cock',
    '\\bpl' + 'um\\b',
    'mrs\\.? wh' + 'ite',
    '(mr|rev(erend)?)\\.? gr' + 'een',
    'colo' + 'nel',
  ].join('|'),
  'i',
);

const TEXT = /\.(ts|mjs|js|css|html|svg|json|md)$/;

function files(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : TEXT.test(name) ? [path] : [];
  });
}

describe('brand guard', () => {
  it('never names the board game it echoes, its owners, or its characters', () => {
    const scanned = [
      ...files(join(root, 'src')),
      ...files(join(root, 'assets')),
      ...files(join(root, 'public/whodunit')),
      join(root, 'package.json'),
    ];
    expect(scanned.length).toBeGreaterThan(20);
    const offenders = scanned.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (FORBIDDEN.test(line) ? [`${relative(root, path)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(offenders).toEqual([]);
  });

  it('calls the game Whodunit? in the page title', () => {
    const html = readFileSync(join(root, 'src/client/index.html'), 'utf8');
    expect(html).toMatch(/<title>Whodunit\? · Galaxy Class<\/title>/);
    const built = join(root, 'public/whodunit/index.html');
    if (existsSync(built)) {
      expect(readFileSync(built, 'utf8')).toMatch(/<title>Whodunit\? · Galaxy Class<\/title>/);
    }
  });
});
