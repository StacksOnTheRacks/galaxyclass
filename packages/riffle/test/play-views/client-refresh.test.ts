// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshPlayTable, resetPlayBindings } from '../../src/client/play.js';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';
import { renderTableShell } from '../../src/client/surfaces/table-shell.js';
import { TEST_MATCH_ID } from '../helpers/fixtures.js';

describe('shared play client refresh', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    window.history.replaceState(null, '', `/play/${TEST_MATCH_ID}`);
    resetPlayBindings();
    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'play-bearer-token', playerSubject: 'anon:seat-a' }),
    );
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('uses play table GETs with identity bearer on shared play URL', async () => {
    const root = document.getElementById('app')!;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === `/v1/play/matches/${TEST_MATCH_ID}/table`) {
        return Response.json({
          matchId: TEST_MATCH_ID,
          seats: [
            { seatId: 'seat-a', playerSubject: 'anon:seat-a', stack: 9900 },
            { seatId: 'seat-b', playerSubject: 'anon:seat-b', stack: 9900 },
          ],
          currentSeat: 'seat-a',
          pot: 150,
          board: ['2c', '3d', '4h'],
        });
      }
      if (url === `/v1/play/matches/${TEST_MATCH_ID}/seats/seat-a/table`) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer play-bearer-token');
        return Response.json({
          matchId: TEST_MATCH_ID,
          seatId: 'seat-a',
          hole: ['As', 'Kh'],
          currentSeat: 'seat-a',
          pot: 150,
          board: ['2c', '3d', '4h'],
          seats: [
            { seatId: 'seat-a', stack: 9900 },
            { seatId: 'seat-b', stack: 9900 },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTableShell(root, { matchId: TEST_MATCH_ID, seatId: 'seat-a' });
    await refreshPlayTable(root, TEST_MATCH_ID);

    expect(root.dataset.surface).toBe('hand-in-progress');
    expect(root.textContent).toContain('As');
    expect(root.textContent).toContain('2c');
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/table?'),
      expect.anything(),
    );
  });
});
