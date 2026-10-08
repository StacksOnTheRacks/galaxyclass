import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

// Built from parts so this file never matches itself.
const FORBIDDEN = new RegExp(
  ['has' + 'bro', 'milton ' + 'bradley', 'sank my ' + 'battleship', 'game of ' + 'battleship', 'battle' + 'ship®'].join('|'),
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
  it('the built client exists (run build:client first)', () => {
    expect(existsSync(join(root, 'public/warships/index.html'))).toBe(true);
    expect(existsSync(join(root, 'public/warships/main.js'))).toBe(true);
    expect(existsSync(join(root, 'public/warships/main.css'))).toBe(true);
  });

  it('never names a trademark owner or uses the ship type as the game name', () => {
    const scanned = [
      ...files(join(root, 'src')),
      ...files(join(root, 'assets')),
      ...files(join(root, 'public/warships')),
      join(root, 'package.json'),
    ];
    expect(scanned.length).toBeGreaterThan(10);
    const offenders = scanned.filter((path) => FORBIDDEN.test(readFileSync(path, 'utf8'))).map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('calls the game Warships in the page title', () => {
    const html = readFileSync(join(root, 'public/warships/index.html'), 'utf8');
    expect(html).toMatch(/<title>Warships · Galaxy Class<\/title>/);
  });
});
