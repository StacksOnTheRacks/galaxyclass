// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';
import { submitPlayAction } from '../../src/client/play.js';

describe('submitPlayAction client', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('posts to the play action URL with identity bearer and no capability header', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          matchId: 'm_test',
          seatId: 's_actor',
          hole: ['As', 'Kh'],
          currentSeat: 's_other',
          pot: 150,
          seats: [
            { seatId: 's_actor', stack: 9900 },
            { seatId: 's_other', stack: 9950 },
          ],
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'identity-bearer-token', playerSubject: 'anon:test' }),
    );

    const root = document.getElementById('app')!;
    await submitPlayAction(root, { matchId: 'm_test', seatId: 's_actor' }, { type: 'call' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/play/matches/m_test/seats/s_actor/actions');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ action: { type: 'call' } }));

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer identity-bearer-token');
    expect(headers['X-Riffle-Seat-Capability']).toBeUndefined();
    expect(document.cookie).not.toContain('identity-bearer-token');
  });

  it('does not POST without a stored identity session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const root = document.getElementById('app')!;
    await submitPlayAction(root, { matchId: 'm_test', seatId: 's_actor' }, { type: 'fold' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
