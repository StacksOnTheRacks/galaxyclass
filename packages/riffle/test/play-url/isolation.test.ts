import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedPlayFrameAncestors } from '../../src/server/play-url/frame-ancestors.js';

const FORBIDDEN_IMPORTS = [
  '@turnur/sdk',
  'vendor/turnur-sdk',
  'requireHostAuth',
  'buildPlaySessionCookie',
  'hands/shoe',
];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('play-url isolation', () => {
  it('shared play source does not import forbidden modules', () => {
    const serverDir = join(process.cwd(), 'src/server/play-url');
    const clientFiles = [
      join(process.cwd(), 'src/client/play-url.ts'),
      join(process.cwd(), 'src/client/surfaces/unseated.ts'),
    ];
    const serverFiles = collectSourceFiles(serverDir);
    const allFiles = [...serverFiles, ...clientFiles];

    for (const file of allFiles) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source, `${file} must not reference ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('sharedPlayFrameAncestors drops star and none tokens', () => {
    const csp = sharedPlayFrameAncestors("'self' * 'none' https://host.example");
    expect(csp).toBe("'self' https://host.example");
    expect(csp).not.toContain('*');
    expect(csp).not.toContain('none');
  });

  it('sharedPlayFrameAncestors defaults to self when env is empty', () => {
    expect(sharedPlayFrameAncestors("'self'")).toBe("'self'");
    expect(sharedPlayFrameAncestors('*')).toBe("'self'");
  });
});
