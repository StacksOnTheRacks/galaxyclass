// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSharedPlay, resetSharedPlayBindings } from '../../src/client/play-url.js';

describe('shared play URL ignores #bt= hash', () => {
  beforeEach(() => {
    resetSharedPlayBindings();
    document.body.innerHTML = '<main id="app"></main>';
    sessionStorage.clear();
  });

  it('does not redeem bootstrap token on /play/:matchId#bt=', async () => {
    const matchId = 'm_hashignored00001';
    window.history.replaceState(null, '', `/play/${matchId}#bt=should-not-redeem`);

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/bootstrap/redeem')) {
        throw new Error('bootstrap redeem must not be called');
      }
      if (url.includes(`/v1/play/matches/${matchId}`)) {
        return new Response(JSON.stringify({ matchId }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const root = document.getElementById('app')!;
    await attachSharedPlay(root);

    expect(root.dataset.surface).toBe('unseated');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/v1/bootstrap/redeem',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
