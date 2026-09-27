// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapPlay,
  parseBootstrapTokenFromHash,
  refreshPlayTable,
  rejectPostMessageBootstrap,
  resetPlayBindings,
  stripBootstrapHash,
} from '../src/client/play.js';
import { acceptSeatCapabilityPostMessage, SEAT_CAPABILITY_MESSAGE_TYPE } from '../src/client/seat-capability.js';
import { renderEmbedError } from '../src/client/surfaces/embed-error.js';
import { renderTableShell } from '../src/client/surfaces/table-shell.js';
import { IDENTITY_SESSION_KEY } from '../src/client/identity/session.js';
import { TABLE_CHANGED_MESSAGE_TYPE } from '../src/client/table-refresh.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';

describe('client bootstrap play flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    window.history.replaceState(null, '', '/play');
    resetPlayBindings();
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: window,
    });
  });

  it('parses bootstrap token from hash fragment', () => {
    const token = 'abc123-token';
    expect(parseBootstrapTokenFromHash(`#bt=${encodeURIComponent(token)}`)).toBe(token);
    expect(parseBootstrapTokenFromHash('#other=1')).toBeUndefined();
    expect(parseBootstrapTokenFromHash('')).toBeUndefined();
  });

  it('strips bootstrap hash via replaceState', () => {
    window.location.hash = '#bt=secret';
    stripBootstrapHash();
    expect(window.location.pathname).toBe('/play');
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
  });

  it('redeem success renders table shell context', async () => {
    const root = document.getElementById('app')!;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/bootstrap/redeem') && init?.method === 'POST') {
        return new Response(JSON.stringify({ matchId: TEST_MATCH_ID, bound: true }), {
          status: 200,
          headers: { 'Set-Cookie': 'riffle_play=sess' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    window.location.hash = '#bt=fresh-token';
    await bootstrapPlay(root);

    expect(root.dataset.surface).toBe('table-shell');
    expect(root.dataset.matchId).toBe(TEST_MATCH_ID);
    expect(root.querySelector('.surface-table-shell')).not.toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('redeem failure renders embed-error surface', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'expired_token' }, { status: 403 }),
      ),
    );

    window.location.hash = '#bt=expired';
    await bootstrapPlay(root);

    expect(root.dataset.surface).toBe('embed-error');
    expect(root.querySelector('.surface-embed-error')).not.toBeNull();
  });

  it('tokenless URL loads session on reload', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        if (String(input).endsWith('/v1/bootstrap/session')) {
          return Response.json({ matchId: TEST_MATCH_ID, bound: true });
        }
        throw new Error('unexpected fetch');
      }),
    );

    await bootstrapPlay(root);

    expect(root.dataset.surface).toBe('table-shell');
    expect(root.dataset.matchId).toBe(TEST_MATCH_ID);
  });

  it('tokenless URL without session shows missing_token embed-error', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        if (String(input).endsWith('/v1/bootstrap/session')) {
          return Response.json({ error: 'invalid_session' }, { status: 403 });
        }
        throw new Error('unexpected fetch');
      }),
    );

    await bootstrapPlay(root);
    expect(root.dataset.surface).toBe('embed-error');
  });

  it('postMessage bootstrap does not attach session', async () => {
    rejectPostMessageBootstrap();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { bootstrapToken: 'via-post-message' },
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mixed bootstrap keys with capability are ignored and do not redeem', async () => {
    const root = document.getElementById('app')!;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/table/seats/me')) {
        return new Response('{}', { status: 200 });
      }
      if (url.endsWith('/v1/bootstrap/redeem') && init?.method === 'POST') {
        return Response.json({ matchId: TEST_MATCH_ID, bound: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    rejectPostMessageBootstrap();
    const { acceptSeatCapabilityPostMessage, seatScopedFetch, SEAT_CAPABILITY_HEADER } =
      await import('../src/client/seat-capability.js');
    acceptSeatCapabilityPostMessage();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'riffle.seatCapability',
          capability: 'e'.repeat(64),
          bootstrapToken: 'via-post-message',
        },
      }),
    );

    await seatScopedFetch('/v1/table/seats/me');
    const seatFetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(
      seatFetchInit?.headers
        ? new Headers(seatFetchInit.headers).get(SEAT_CAPABILITY_HEADER)
        : null,
    ).toBeNull();

    window.location.hash = '#bt=hash-only-token';
    await bootstrapPlay(root);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/bootstrap/redeem'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('table shell includes waiting-for-deal chrome and a11y labels', () => {
    const root = document.getElementById('app')!;
    renderTableShell(root, { matchId: TEST_MATCH_ID });

    const shell = root.querySelector('.surface-table-shell');
    expect(shell?.getAttribute('aria-label')).toBe('Poker table waiting for deal');
    expect(root.querySelector('.table-felt')).not.toBeNull();
    expect(root.textContent).toContain('Waiting for deal');

    const holeArea = root.querySelector('.hole-area');
    expect(holeArea?.getAttribute('aria-label')).toBe(
      'Your hole cards, seat-private, empty',
    );
    expect(root.querySelector('.player-seat-label')?.textContent).toBe('YOU');
    expect(root.querySelector('.hole-cards-empty')).not.toBeNull();
    expect(root.querySelector('.hole-cards-empty')?.children.length).toBe(0);
  });

  it('embed-error uses alert semantics', () => {
    const root = document.getElementById('app')!;
    renderEmbedError(root, 'already_used');

    const panel = root.querySelector('.surface-embed-error');
    expect(panel?.getAttribute('role')).toBe('alert');
  });

  it('table refresh after deal renders hand-in-progress with hole cards', async () => {
    const root = document.getElementById('app')!;
    acceptSeatCapabilityPostMessage();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: 'a'.repeat(64) },
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.startsWith('/v1/table?')) {
          return Response.json({
            matchId: TEST_MATCH_ID,
            seats: [{ seatId: 'seat-1' }, { seatId: 'seat-2' }],
            currentSeat: 'seat-1',
            pot: 150,
          });
        }
        if (url.includes('/v1/seats/seat-1/table')) {
          return Response.json({
            matchId: TEST_MATCH_ID,
            seatId: 'seat-1',
            hole: ['As', 'Kh'],
            currentSeat: 'seat-1',
            pot: 150,
            seats: [
              { seatId: 'seat-1', stack: 9950 },
              { seatId: 'seat-2', stack: 9900 },
            ],
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    renderTableShell(root, { matchId: TEST_MATCH_ID });
    await refreshPlayTable(root, TEST_MATCH_ID);

    expect(root.dataset.surface).toBe('hand-in-progress');
    expect(root.textContent).toContain('Hand in progress');
    expect(root.textContent).toContain('As');
    expect(root.textContent).toContain('Kh');
    expect(root.querySelector('.actions-bar-disabled')).not.toBeNull();
  });

  it('table refresh on-turn renders operable Fold/Check/Bet controls', async () => {
    const root = document.getElementById('app')!;
    acceptSeatCapabilityPostMessage();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: 'a'.repeat(64) },
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.startsWith('/v1/table?')) {
          return Response.json({
            matchId: TEST_MATCH_ID,
            seats: [{ seatId: 'seat-1' }, { seatId: 'seat-2' }],
            currentSeat: 'seat-1',
            pot: 150,
          });
        }
        if (url.includes('/v1/seats/seat-1/table')) {
          return Response.json({
            matchId: TEST_MATCH_ID,
            seatId: 'seat-1',
            hole: ['As', 'Kh'],
            currentSeat: 'seat-1',
            pot: 150,
            seats: [
              { seatId: 'seat-1', stack: 9950 },
              { seatId: 'seat-2', stack: 9900 },
            ],
            legalActions: [
              { type: 'fold' },
              { type: 'call', amount: 50 },
              { type: 'raise', amount: 200 },
            ],
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    renderTableShell(root, { matchId: TEST_MATCH_ID });
    await refreshPlayTable(root, TEST_MATCH_ID);

    expect(root.dataset.surface).toBe('my-turn');
    expect(root.textContent).toContain('Your turn');
    expect(root.querySelector('.action-fold')?.textContent).toBe('Fold');
    expect(root.querySelector('.action-check-call')?.textContent).toBe('Call');
    expect(root.querySelector('.action-bet-raise')?.textContent).toBe('Raise');
  });

  it('submitting a legal action posts to the play action route and notifies the parent', async () => {
    const root = document.getElementById('app')!;
    acceptSeatCapabilityPostMessage();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: 'a'.repeat(64) },
      }),
    );

    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'play-bearer-token', playerSubject: 'anon:test' }),
    );

    const parentPost = vi.fn();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: parentPost },
    });

    let submitted = false;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/v1/table?')) {
        return Response.json({
          matchId: TEST_MATCH_ID,
          seats: [{ seatId: 'seat-1' }, { seatId: 'seat-2' }],
          currentSeat: submitted ? 'seat-2' : 'seat-1',
          pot: 200,
        });
      }
      if (url.includes('/v1/seats/seat-1/table')) {
        return Response.json({
          matchId: TEST_MATCH_ID,
          seatId: 'seat-1',
          hole: ['As', 'Kh'],
          currentSeat: submitted ? 'seat-2' : 'seat-1',
          pot: 200,
          seats: [
            { seatId: 'seat-1', stack: 9900 },
            { seatId: 'seat-2', stack: 9900 },
          ],
          legalActions: submitted
            ? undefined
            : [{ type: 'fold' }, { type: 'call', amount: 50 }, { type: 'raise', amount: 200 }],
        });
      }
      if (
        url === `/v1/play/matches/${TEST_MATCH_ID}/seats/seat-1/actions` &&
        init?.method === 'POST'
      ) {
        submitted = true;
        return Response.json({
          matchId: TEST_MATCH_ID,
          seatId: 'seat-1',
          hole: ['As', 'Kh'],
          currentSeat: 'seat-2',
          pot: 200,
          seats: [
            { seatId: 'seat-1', stack: 9900 },
            { seatId: 'seat-2', stack: 9900 },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTableShell(root, { matchId: TEST_MATCH_ID });
    await refreshPlayTable(root, TEST_MATCH_ID);

    const foldButton = root.querySelector('.action-fold') as HTMLButtonElement;
    foldButton.click();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/v1/play/matches/${TEST_MATCH_ID}/seats/seat-1/actions`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: { type: 'fold' } }),
          headers: expect.objectContaining({
            Authorization: 'Bearer play-bearer-token',
          }),
        }),
      );
    });

    await vi.waitFor(() => {
      expect(parentPost).toHaveBeenCalledWith(
        { type: TABLE_CHANGED_MESSAGE_TYPE },
        window.location.origin,
      );
    });
    expect(root.dataset.surface).toBe('hand-in-progress');
  });
});
