import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatchStore } from '../../src/match-store/index.js';

const projectRoot = join(import.meta.dirname, '../..');

describe('match store isolation', () => {
  it('does not import @turnur/sdk, loadShoe, putShoe, or identity under match-store/', () => {
    const output = execSync(
      'rg -n "@turnur/sdk|vendor/turnur-sdk|loadShoe|putShoe|src/identity/" src/match-store || true',
      { cwd: projectRoot, encoding: 'utf8' },
    );
    expect(output.trim()).toBe('');
  });

  it('two store instances do not share matches', () => {
    const a = createMatchStore();
    const b = createMatchStore();

    const created = a.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    expect(b.getPublicState(created.value.matchId).ok).toBe(false);
  });
});
