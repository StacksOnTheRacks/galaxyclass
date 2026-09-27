// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatchStore } from '../../src/match-store/index.js';
import {
  attachSharedPlay,
  isEmbedChrome,
  lookupPlayMatch,
  parsePlayUrlMatchId,
  resetSharedPlayBindings,
} from '../../src/client/play-url.js';
import { renderLoading } from '../../src/client/surfaces/loading.js';

describe('shared play URL client attach', () => {
  beforeEach(() => {
    resetSharedPlayBindings();
    document.body.innerHTML = '<main id="app"></main>';
    document.documentElement.removeAttribute('data-embed');
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
  });

  it('parses matchId from pathname', () => {
    expect(parsePlayUrlMatchId('/play/m_abc123')).toBe('m_abc123');
    expect(parsePlayUrlMatchId('/play')).toBeUndefined();
    expect(parsePlayUrlMatchId('/play/')).toBeUndefined();
  });

  it('detects embed chrome query param', () => {
    expect(isEmbedChrome('?embed=1')).toBe(true);
    expect(isEmbedChrome('')).toBe(false);
  });

  it('shows shared loading copy', () => {
    const root = document.getElementById('app')!;
    renderLoading(root, { copy: 'shared' });
    expect(root.dataset.surface).toBe('loading');
    expect(root.textContent).toContain('Loading table…');
    expect(root.textContent).toContain('Opening play link · no actions yet');
    expect(root.textContent).not.toContain('Joining table');
  });

  it('attaches to seeded match and shows unseated felt', async () => {
    const matchStore = createMatchStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const matchId = created.value.matchId;
    window.history.replaceState(null, '', `/play/${matchId}`);

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith(`/v1/play/matches/${matchId}/table`)) {
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
      if (url.includes(`/v1/play/matches/${matchId}`)) {
        return new Response(JSON.stringify({ matchId }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const root = document.getElementById('app')!;
    await attachSharedPlay(root);

    expect(root.dataset.surface).toBe('unseated');
    expect(root.textContent).toContain('Between hands');
    expect(root.textContent).toContain('Pick a seat');
    expect(root.textContent).toContain('Seat 1 · open');
    expect(root.textContent).toContain('Seat 2 · open');
    expect(root.textContent).not.toContain('Seat 3');
    expect(root.textContent).toContain('Sit at Table');
    expect(root.textContent).not.toContain('YOU');
    expect(root.textContent).not.toContain('Waiting for deal');
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/bootstrap/redeem'),
      expect.anything(),
    );
  });

  it('shows embed-error for unknown matchId', async () => {
    window.history.replaceState(null, '', '/play/m_unknown0000000000');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'match_not_found' }), { status: 404 })),
    );

    const root = document.getElementById('app')!;
    await attachSharedPlay(root);

    expect(root.dataset.surface).toBe('embed-error');
    expect(root.textContent).toContain("Couldn't open this table");
    expect(root.textContent).toContain('This play link is invalid, expired, or unavailable');
    expect(root.textContent).toContain('This is not a Riffle login');
  });

  it('sets embed dataset when embed=1', async () => {
    const matchId = 'm_testembed0000001';
    window.history.replaceState(null, '', `/play/${matchId}?embed=1`);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
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
      }),
    );

    const root = document.getElementById('app')!;
    await attachSharedPlay(root);

    expect(document.documentElement.dataset.embed).toBe('1');
    expect(root.dataset.surface).toBe('unseated');
    expect(root.textContent).not.toContain('Sign in');
    expect(root.textContent).not.toContain('Create account');
    expect(root.textContent).not.toContain('Play without account');
  });

  it('Sit at Table click POSTs sit after ensuring bearer', async () => {
    const matchId = 'm_testsitnoop00001';
    window.history.replaceState(null, '', `/play/${matchId}`);

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith(`/v1/play/matches/${matchId}/table`)) {
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
      if (url.includes(`/v1/play/matches/${matchId}`)) {
        return new Response(JSON.stringify({ matchId }), { status: 200 });
      }
      if (url.endsWith('/v1/identity/anonymous')) {
        return new Response(
          JSON.stringify({ bearer: 'anon-test', playerSubject: 'anon:test' }),
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

    const sitButton = root.querySelector('.unseated-sit-button') as HTMLButtonElement;
    sitButton.click();

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/sit'))).toBe(true);
    });
    expect(sessionStorage.getItem('riffle.identity.session')).toContain('anon-test');
  });

  it('lookupPlayMatch returns boolean from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ matchId: 'm_x' }), { status: 200 })),
    );
    await expect(lookupPlayMatch('m_x')).resolves.toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'match_not_found' }), { status: 404 })),
    );
    await expect(lookupPlayMatch('m_missing')).resolves.toBe(false);
  });
});
