import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = new RegExp(['scr', 'abble'].join(''), 'i');
const TEXT = /\.(ts|js|mjs|css|html|json|svg|md|txt)$/;

function files(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : TEXT.test(name) ? [full] : [];
  });
}

describe('brand guard', () => {
  it('never names the board game Scribble resembles in source, assets, or the built client', () => {
    const scanned = [
      ...files(path.join(root, 'src')),
      ...files(path.join(root, 'assets')),
      ...files(path.join(root, 'public/scribble')),
      path.join(root, 'package.json'),
      path.join(root, 'dictionary/README.md'),
    ];
    expect(scanned.length).toBeGreaterThan(20);
    const hits = scanned.filter((file) => BRAND.test(readFileSync(file, 'utf8'))).map((file) => path.relative(root, file));
    expect(hits).toEqual([]);
  });

  it('has a built client to scan', () => {
    expect(existsSync(path.join(root, 'public/scribble/index.html'))).toBe(true);
  });
});
