import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = join(import.meta.dirname, '../..');

describe('identity isolation', () => {
  it('does not import Cognito, Amplify, SRP, or @turnur/sdk under identity/', () => {
    const output = execSync(
      "rg -n \"cognito|amplify|USER_SRP_AUTH|@turnur/sdk\" src/identity src/server/identity src/client/identity src/client/identity.ts || true",
      { cwd: projectRoot, encoding: 'utf8' },
    );
    expect(output.trim()).toBe('');
  });

  it('identity server routes do not import bootstrap cookie helpers', () => {
    const output = execSync(
      'rg -n "bootstrap/cookie|buildPlaySessionCookie|parsePlaySessionCookie" src/server/identity src/identity || true',
      { cwd: projectRoot, encoding: 'utf8' },
    );
    expect(output.trim()).toBe('');
  });
});
