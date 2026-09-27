import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLAY_ACTIONS_ROOT = join(process.cwd(), 'src/server/play-actions');
const MATCH_STORE_STORE = join(process.cwd(), 'src/match-store/store.ts');

const FORBIDDEN = [
  '@turnur/sdk',
  'vendor/turnur-sdk',
  'requireHostAuth',
  'parsePlaySessionCookie',
  'buildPlaySessionCookie',
  'src/server/turnur/',
];

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('play action isolation', () => {
  it('does not import Turnur or frozen host-key helpers from play-actions', () => {
    for (const file of collectFiles(PLAY_ACTIONS_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const needle of FORBIDDEN) {
        expect(source, `${file} must not reference ${needle}`).not.toContain(needle);
      }
    }
  });

  it('does not import @turnur/sdk from applyPlayerAction store path', () => {
    const source = readFileSync(MATCH_STORE_STORE, 'utf8');
    expect(source).not.toContain('@turnur/sdk');
    expect(source).not.toContain('vendor/turnur-sdk');
  });
});
