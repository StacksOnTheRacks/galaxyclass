import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = join(import.meta.dirname, '../..');

describe('ws isolation', () => {
  it('does not import @turnur/sdk or Turnur session helpers under ws/ and table-notify', () => {
    const output = execSync(
      'rg -n "@turnur/sdk|vendor/turnur-sdk|TURNUR_WS_URL|bootstrap/cookie|buildPlaySessionCookie|parsePlaySessionCookie" src/ws src/client/table-notify.ts || true',
      { cwd: projectRoot, encoding: 'utf8' },
    );
    expect(output.trim()).toBe('');
  });
});
