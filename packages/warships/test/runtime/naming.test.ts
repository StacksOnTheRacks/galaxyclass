import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** "Battleship" is one ship class in the fleet, never the name of the game. */
const TRADEMARK = /hasbro|milton bradley|sank my battleship|game of battleship|battleship®|battleship (game|online)|play battleship/i;

function files(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|mjs|json|md)$/.test(name) ? [full] : [];
  });
}

describe('naming in the backend', () => {
  it('calls the game Warships in the rules, runtime, dev server, and wire contract', () => {
    const scanned = [
      ...files(path.join(root, 'src/rules')),
      ...files(path.join(root, 'src/runtime')),
      ...files(path.join(root, 'src/dev')),
      path.join(root, 'src/protocol.ts'),
      path.join(root, 'package.json'),
    ];
    expect(scanned.length).toBeGreaterThan(15);
    const hits = scanned.filter((file) => TRADEMARK.test(readFileSync(file, 'utf8'))).map((file) => path.relative(root, file));
    expect(hits).toEqual([]);
  });
});
