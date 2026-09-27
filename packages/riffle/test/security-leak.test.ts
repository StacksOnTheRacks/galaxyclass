import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = join(import.meta.dirname, '..');
const bundlePaths = [
  join(projectRoot, 'public', 'play.js'),
  join(projectRoot, 'public', 'play.css'),
  join(projectRoot, 'public', 'lab.js'),
  join(projectRoot, 'public', 'lab.css'),
];

const forbiddenPatterns = [
  /TURNUR_/,
  /turnur-sdk/i,
  /@turnur\/sdk/,
  /RIFFLE_HOST_API_KEY/,
  /test-host-key-fixture/,
];

describe('bundle security leak grep', () => {
  for (const bundlePath of bundlePaths) {
    it(`does not leak SDK or host secrets in ${bundlePath.split('/').pop()}`, () => {
      const contents = readFileSync(bundlePath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(contents).not.toMatch(pattern);
      }
    });
  }
});
