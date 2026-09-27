import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_IMPORTS = [
  '@turnur/sdk',
  'vendor/turnur-sdk',
  'requireHostAuth',
  'buildPlaySessionCookie',
  'parsePlaySessionCookie',
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

describe('sit isolation', () => {
  it('sit source does not import forbidden modules', () => {
    const serverDir = join(process.cwd(), 'src/server/sit');
    const clientFiles = [
      join(process.cwd(), 'src/client/sit.ts'),
      join(process.cwd(), 'src/client/surfaces/sit-submitting.ts'),
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
});
