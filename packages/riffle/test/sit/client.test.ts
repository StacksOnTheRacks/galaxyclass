// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';
import {
  ensureBearer,
  fetchPublicTable,
  handleSitAtTable,
  postSit,
} from '../../src/client/sit.js';
import { renderUnseated } from '../../src/client/surfaces/unseated.js';

describe('sit client', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    sessionStorage.clear();
  });

  it('issues anonymous then sits when no stored session', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/v1/identity/anonymous')) {
        return new Response(
          JSON.stringify({ bearer: 'anon-bearer-1', playerSubject: 'anon:jti-1' }),
          { status: 201 },
        );
      }
      if (url.endsWith('/sit')) {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer anon-bearer-1',
        });
        return new Response(
          JSON.stringify({
            matchId: 'm_test',
            seatId: 's_1',
            seats: [{ seatId: 's_1', playerSubject: 'anon:jti-1', displayName: null, stack: 10000 }],
            currentSeat: null,
          }),
          { status: 201 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await postSit('m_test');
    expect(response.status).toBe(201);
    expect(sessionStorage.getItem(IDENTITY_SESSION_KEY)).toContain('anon-bearer-1');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/anonymous'))).toBe(true);
  });

  it('reuses existing anonymous bearer without second issue', async () => {
    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'existing-bearer', playerSubject: 'anon:existing' }),
    );

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/anonymous')) {
        throw new Error('should not issue anonymous');
      }
      if (url.endsWith('/sit')) {
        return new Response(
          JSON.stringify({
            matchId: 'm_test',
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

    await postSit('m_test');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/anonymous'))).toHaveLength(0);
  });

  it('ensureBearer returns stored account session without anonymous issue', async () => {
    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({
        bearer: 'acct-bearer',
        playerSubject: 'acct_123',
        kind: 'account',
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const session = await ensureBearer();
    expect(session.playerSubject).toBe('acct_123');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('click flow shows sit-submitting then waiting-for-deal', async () => {
    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'bearer-1', playerSubject: 'anon:1' }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/sit') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              matchId: 'm_ui',
              seatId: 's_1',
              seats: [],
              currentSeat: null,
            }),
            { status: 201 },
          );
        }
        if (url.endsWith('/table')) {
          return new Response(JSON.stringify({ seats: [] }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const root = document.getElementById('app')!;
    renderUnseated(root, {
      matchId: 'm_ui',
      seats: [
        { seatId: 's_1', playerSubject: null, displayName: null, stack: 10000 },
        { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
      ],
      onSit: () => {
        void handleSitAtTable(root, 'm_ui');
      },
    });

    const sitButton = root.querySelector('.unseated-sit-button') as HTMLButtonElement;
    sitButton.click();
    await vi.waitFor(() => {
      expect(root.dataset.surface).toBe('table-shell');
    });
    expect(root.textContent).toContain('YOU');
    expect(root.textContent).toContain('Waiting for deal');
  });

  it('renders only roster seats from public table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            matchId: 'm_two',
            seats: [
              { seatId: 's_1', playerSubject: null, displayName: null, stack: 10000 },
              { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
            ],
            currentSeat: null,
          }),
          { status: 200 },
        ),
      ),
    );

    const table = await fetchPublicTable('m_two');
    expect(table?.seats).toHaveLength(2);

    const root = document.getElementById('app')!;
    renderUnseated(root, { matchId: 'm_two', seats: table!.seats });
    expect(root.textContent).toContain('Seat 1 · open');
    expect(root.textContent).toContain('Seat 2 · open');
    expect(root.textContent).not.toContain('Seat 3');
  });

  it('keyboard activates Sit at Table button', () => {
    const root = document.getElementById('app')!;
    let clicked = false;
    renderUnseated(root, {
      matchId: 'm_kb',
      seats: [{ seatId: 's_1', playerSubject: null, displayName: null, stack: 10000 }],
      onSit: () => {
        clicked = true;
      },
    });

    const sitButton = root.querySelector('.unseated-sit-button') as HTMLButtonElement;
    sitButton.focus();
    sitButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    sitButton.click();
    expect(document.activeElement).toBe(sitButton);
    expect(clicked).toBe(true);
  });
});
