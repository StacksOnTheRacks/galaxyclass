// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSharedPlay } from '../../src/client/play-url.js';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';

describe('sit embed', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    document.documentElement.removeAttribute('data-embed');
    sessionStorage.clear();
  });

  it('embed attach has no login chrome and guest sit issues anonymous', async () => {
    const matchId = 'm_embed000000001';
    window.history.replaceState(null, '', `/play/${matchId}?embed=1`);

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes(`/v1/play/matches/${matchId}`) && !url.endsWith('/sit')) {
        if (url.endsWith('/table')) {
          return new Response(
            JSON.stringify({
              matchId,
              seats: [
                { seatId: 's_1', playerSubject: null, displayName: null, stack: 10000 },
                { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
              ],
              currentSeat: null,
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ matchId }), { status: 200 });
      }
      if (url.endsWith('/v1/identity/anonymous')) {
        return new Response(
          JSON.stringify({ bearer: 'embed-anon', playerSubject: 'anon:embed' }),
          { status: 201 },
        );
      }
      if (url.endsWith('/sit')) {
        return new Response(
          JSON.stringify({
            matchId,
            seatId: 's_1',
            seats: [],
            currentSeat: null,
          }),
          { status: 201 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const root = document.getElementById('app')!;
    await attachSharedPlay(root);

    expect(root.textContent).not.toContain('Sign in');
    expect(root.textContent).not.toContain('Create account');
    expect(root.textContent).not.toContain('Play without account');

    const sitButton = root.querySelector('.unseated-sit-button') as HTMLButtonElement;
    sitButton.click();

    await vi.waitFor(() => {
      expect(sessionStorage.getItem(IDENTITY_SESSION_KEY)).toContain('embed-anon');
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/anonymous'))).toBe(true);
  });
});
