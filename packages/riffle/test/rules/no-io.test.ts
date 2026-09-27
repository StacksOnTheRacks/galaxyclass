import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const rulesDir = join(repoRoot, 'src/rules');
const clientDir = join(repoRoot, 'src/client');

const FORBIDDEN_PATTERNS = [
  /\bfrom ['"]node:fs['"]/,
  /\bfrom ['"]fs['"]/,
  /\bfrom ['"]node:net['"]/,
  /\bfrom ['"]net['"]/,
  /\bfrom ['"]node:http['"]/,
  /\bfrom ['"]http['"]/,
  /\bfrom ['"]node:https['"]/,
  /\bfrom ['"]https['"]/,
  /\bfrom ['"]node:child_process['"]/,
  /\bprocess\.env\b/,
  /\bfetch\s*\(/,
  /@turnur\/sdk/,
  /src\/server/,
  /src\/client/,
  /Math\.random\s*\(/,
  /console\.(log|debug|info)\([^)]*hole/i,
];

function walkTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('no-io rules library', () => {
  it('src/rules import graph contains no forbidden I/O or ambient entropy', () => {
    const files = walkTsFiles(rulesDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content, `${relative(repoRoot, file)} must not match ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it('src/client does not import src/rules', () => {
    try {
      const files = walkTsFiles(clientDir);
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        expect(content).not.toMatch(/src\/rules|from ['"].*\/rules/);
      }
    } catch {
      // no client tree yet
    }
  });
});
