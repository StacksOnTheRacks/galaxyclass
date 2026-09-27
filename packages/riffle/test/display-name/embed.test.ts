// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';
import { handleSitAtTable } from '../../src/client/sit.js';
import { renderUnseated } from '../../src/client/surfaces/unseated.js';

describe('display-name embed', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    document.documentElement.dataset.embed = '1';
    sessionStorage.clear();
  });

  it('embed seated flow exposes Edit display name without login chrome', async () => {
    const matchId = 'm_embed000000001';
    window.history.replaceState(null, '', `/play/${matchId}?embed=1`);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/sit') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              matchId,
              seatId: 's_1',
              seats: [
                { seatId: 's_1', playerSubject: 'anon:embed', displayName: null, stack: 10000 },
                { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
              ],
              currentSeat: null,
            }),
            { status: 201 },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'embed-bearer', playerSubject: 'anon:embed' }),
    );

    const root = document.getElementById('app')!;
    renderUnseated(root, {
      matchId,
      seats: [
        { seatId: 's_1', playerSubject: null, displayName: null, stack: 10000 },
        { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
      ],
      onSit: () => {
        void handleSitAtTable(root, matchId);
      },
    });

    root.querySelector<HTMLButtonElement>('.unseated-sit-button')!.click();

    await vi.waitFor(() => {
      expect(root.dataset.surface).toBe('table-shell');
    });

    expect(root.textContent).not.toContain('Sign in');
    expect(root.textContent).not.toContain('Create account');
    expect(root.textContent).not.toContain('Play without account');
    expect(root.querySelector('.table-edit-display-name')?.textContent).toBe('Edit display name');
  });
});
