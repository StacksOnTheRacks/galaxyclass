import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function readAllTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readAllTsFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(readFileSync(fullPath, 'utf8'));
    }
  }
  return files;
}

describe('play-views isolation', () => {
  it('does not import Turnur SDK or frozen host-key helpers', () => {
    const playViewsDir = path.join(ROOT, 'server/play-views');
    const contents = readAllTsFiles(playViewsDir).join('\n');
    expect(contents).not.toContain('@turnur/sdk');
    expect(contents).not.toContain('requireHostAuth');
    expect(contents).not.toContain('parsePlaySessionCookie');
    expect(contents).not.toContain('src/server/table/view');
    expect(contents).not.toContain('src/server/hands/advance');
  });

  it('advanceStreetIfComplete stays in match-store without Turnur imports', () => {
    const storeSource = readFileSync(path.join(ROOT, 'match-store/store.ts'), 'utf8');
    expect(storeSource).toContain('advanceStreetIfComplete');
    expect(storeSource).not.toContain('@turnur/sdk');
  });
});
