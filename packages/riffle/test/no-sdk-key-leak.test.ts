import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPlayCss, readPlayHtml, readPlayJs, readLabCss, readLabHtml, readLabJs } from '../src/server/env.js';
import { TEST_TURNUR_SDK_KEY } from './helpers/turnur-fixtures.js';

const projectRoot = join(import.meta.dirname, '..');

const forbiddenPatterns = [
  /TURNUR_SDK_KEY/,
  /TURNUR_BASE_URL/,
  new RegExp(TEST_TURNUR_SDK_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  /VITE_TURNUR_/,
  /PUBLIC_TURNUR_/,
  /@turnur\/sdk/,
  /createTurnurClient/,
  /Authorization:\s*Bearer/i,
];

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath, acc);
    } else if (/\.(ts|tsx|js|css|html|json)$/.test(entry)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function assertNoForbiddenPatterns(label: string, contents: string): void {
  for (const pattern of forbiddenPatterns) {
    expect(contents, `${label} must not match ${pattern}`).not.toMatch(pattern);
  }
}

describe('Turnur SDK key leak prevention', () => {
  it('does not expose Turnur credentials in built play bundles', () => {
    assertNoForbiddenPatterns('play.js', readPlayJs());
    assertNoForbiddenPatterns('play.css', readPlayCss());
  });

  it('does not expose Turnur credentials in built lab bundles', () => {
    assertNoForbiddenPatterns('lab.js', readLabJs());
    assertNoForbiddenPatterns('lab.css', readLabCss());
  });

  it('does not expose Turnur credentials in play HTML', () => {
    assertNoForbiddenPatterns('play.html', readPlayHtml());
  });

  it('does not expose Turnur credentials in lab HTML', () => {
    assertNoForbiddenPatterns('lab.html', readLabHtml());
  });

  it('does not expose Turnur credentials in client source files', () => {
    const clientDir = join(projectRoot, 'src', 'client');
    for (const filePath of collectFiles(clientDir)) {
      const contents = readFileSync(filePath, 'utf8');
      assertNoForbiddenPatterns(filePath, contents);
      expect(contents).not.toMatch(/from ['"]@turnur\/sdk['"]/);
    }
  });

  it('allows server-side env example placeholders without fixture key material', () => {
    const envExample = readFileSync(join(projectRoot, '.env.example'), 'utf8');
    expect(envExample).toContain('TURNUR_SDK_KEY=');
    expect(envExample).toContain('TURNUR_BASE_URL=');
    expect(envExample).not.toContain(TEST_TURNUR_SDK_KEY);
  });

  it('extends bootstrap bundle leak checks from issue #1', () => {
    const securityLeakPatterns = [
      /TURNUR_/,
      /turnur-sdk/i,
      /@turnur\/sdk/,
      /RIFFLE_HOST_API_KEY/,
      /test-host-key-fixture/,
    ];

    for (const bundlePath of [
      join(projectRoot, 'public', 'play.js'),
      join(projectRoot, 'public', 'play.css'),
    ]) {
      const contents = readFileSync(bundlePath, 'utf8');
      for (const pattern of securityLeakPatterns) {
        expect(contents).not.toMatch(pattern);
      }
    }
  });

  it('extends seat capability source leak checks from issue #3', () => {
    const seatCapabilityDir = join(projectRoot, 'src', 'server', 'seats', 'capability');
    for (const filePath of collectFiles(seatCapabilityDir)) {
      const contents = readFileSync(filePath, 'utf8');
      expect(contents).not.toMatch(/@turnur\/sdk/);
      expect(contents).not.toMatch(/TURNUR_SDK_KEY/);
    }
  });

  it('extends hands/table source leak checks from issue #6', () => {
    const dirs = [
      join(projectRoot, 'src', 'server', 'hands'),
      join(projectRoot, 'src', 'server', 'table'),
      join(projectRoot, 'src', 'server', 'actions'),
    ];
    for (const dir of dirs) {
      for (const filePath of collectFiles(dir)) {
        const contents = readFileSync(filePath, 'utf8');
        expect(contents).not.toMatch(/TURNUR_SDK_KEY/);
        if (
          !filePath.endsWith('deal.ts') &&
          !filePath.endsWith('open.ts') &&
          !filePath.endsWith('submit.ts') &&
          !filePath.endsWith('advance.ts') &&
          !filePath.endsWith('complete.ts') &&
          !filePath.endsWith('shoe.ts') &&
          !filePath.endsWith('public.ts') &&
          !filePath.endsWith('view.ts') &&
          !filePath.endsWith('seat.ts') &&
          !filePath.endsWith('routes.ts')
        ) {
          expect(contents).not.toMatch(/@turnur\/sdk/);
        }
      }
    }

    for (const filePath of collectFiles(join(projectRoot, 'src', 'client', 'surfaces'))) {
      const contents = readFileSync(filePath, 'utf8');
      assertNoForbiddenPatterns(filePath, contents);
      expect(contents).not.toMatch(/from ['"].*\/rules\//);
    }

    const clientFiles = [
      join(projectRoot, 'src', 'client', 'actions-bar.ts'),
      join(projectRoot, 'src', 'client', 'board.ts'),
      join(projectRoot, 'src', 'client', 'hand-complete.ts'),
    ];
    for (const filePath of clientFiles) {
      const contents = readFileSync(filePath, 'utf8');
      assertNoForbiddenPatterns(filePath, contents);
      expect(contents).not.toMatch(/from ['"].*\/rules\//);
    }
  });
});
