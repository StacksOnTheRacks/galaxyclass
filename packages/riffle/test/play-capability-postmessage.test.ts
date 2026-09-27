// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptSeatCapabilityPostMessage,
  clearStoredSeatCapability,
  SEAT_CAPABILITY_HEADER,
  SEAT_CAPABILITY_MESSAGE_TYPE,
  seatScopedFetch,
} from '../src/client/seat-capability.js';
import { bootstrapPlay, rejectPostMessageBootstrap } from '../src/client/play.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';

const TEST_CAPABILITY = 'a'.repeat(64);

function postCapabilityMessage(
  data: unknown,
  origin: string = window.location.origin,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin,
    }),
  );
}

function validCapabilityMessage(capability: string = TEST_CAPABILITY) {
  return { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability };
}

function headerFromFetchCall(
  fetchMock: ReturnType<typeof vi.fn>,
): string | null {
  const call = fetchMock.mock.calls[0] as [RequestInfo, RequestInit?];
  const init = call[1];
  if (!init?.headers) {
    return null;
  }
  return new Headers(init.headers).get(SEAT_CAPABILITY_HEADER);
}

describe('play capability postMessage', () => {
  beforeEach(() => {
    clearStoredSeatCapability();
    document.body.innerHTML = '<main id="app"></main>';
    window.history.replaceState(null, '', '/play');
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = '';
  });

  it('stores a valid allowlisted capability message', async () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage());

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get(SEAT_CAPABILITY_HEADER)).toBe(TEST_CAPABILITY);
  });

  it('attaches capability header on seat-scoped POST', async () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage('b'.repeat(64)));

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/actions/fold', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get(SEAT_CAPABILITY_HEADER)).toBe('b'.repeat(64));
  });

  it('overwrites a caller-supplied capability header when stored', async () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage());

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me', {
      headers: { [SEAT_CAPABILITY_HEADER]: 'wrong-token' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get(SEAT_CAPABILITY_HEADER)).toBe(TEST_CAPABILITY);
  });

  it('omits the capability header when nothing is stored', async () => {
    acceptSeatCapabilityPostMessage();

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(headerFromFetchCall(fetchMock)).toBeNull();
  });

  it('ignores messages from a non-allowlisted origin', async () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage(), 'https://evil.example');

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(headerFromFetchCall(fetchMock)).toBeNull();
  });

  it('ignores messages with an empty origin', async () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage(), '');

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(headerFromFetchCall(fetchMock)).toBeNull();
  });

  it('ignores bootstrap-shaped messages with token', async () => {
    rejectPostMessageBootstrap();
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage({ token: 'bootstrap-via-post' });

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(headerFromFetchCall(fetchMock)).toBeNull();
  });

  it('ignores mixed bootstrap and capability payloads', async () => {
    rejectPostMessageBootstrap();
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage({
      type: SEAT_CAPABILITY_MESSAGE_TYPE,
      capability: TEST_CAPABILITY,
      bt: 'mixed-bootstrap',
    });

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(headerFromFetchCall(fetchMock)).toBeNull();
  });

  it('ignores closed-schema mismatches', async () => {
    acceptSeatCapabilityPostMessage();

    postCapabilityMessage({ type: 'other.message', capability: TEST_CAPABILITY });
    postCapabilityMessage({ type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: '' });
    postCapabilityMessage({
      type: SEAT_CAPABILITY_MESSAGE_TYPE,
      capability: TEST_CAPABILITY,
      extra: 'field',
    });
    postCapabilityMessage(null);
    postCapabilityMessage('not-an-object');

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    expect(headerFromFetchCall(fetchMock)).toBeNull();
  });

  it('last valid message wins', async () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage('c'.repeat(64)));
    postCapabilityMessage(validCapabilityMessage('d'.repeat(64)));

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await seatScopedFetch('/v1/table/seats/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get(SEAT_CAPABILITY_HEADER)).toBe('d'.repeat(64));
  });

  it('does not persist capability in cookie or web storage', () => {
    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage());

    expect(document.cookie).not.toContain(TEST_CAPABILITY);
    expect(localStorage.getItem('capability')).toBeNull();
    expect(sessionStorage.getItem('capability')).toBeNull();

    for (const key of Object.keys(localStorage)) {
      expect(localStorage.getItem(key)).not.toContain(TEST_CAPABILITY);
    }
    for (const key of Object.keys(sessionStorage)) {
      expect(sessionStorage.getItem(key)).not.toContain(TEST_CAPABILITY);
    }
  });

  it('bootstrap redeem and session fetches omit capability header after store', async () => {
    const root = document.getElementById('app')!;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      expect(headers.get(SEAT_CAPABILITY_HEADER)).toBeNull();

      if (url.endsWith('/v1/bootstrap/redeem') && init?.method === 'POST') {
        return Response.json({ matchId: TEST_MATCH_ID, bound: true });
      }
      if (url.endsWith('/v1/bootstrap/session')) {
        return Response.json({ matchId: TEST_MATCH_ID, bound: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    postCapabilityMessage(validCapabilityMessage());

    window.location.hash = '#bt=fresh-token';
    await bootstrapPlay(root);
    expect(fetchMock).toHaveBeenCalled();

    clearStoredSeatCapability();
    fetchMock.mockClear();
    postCapabilityMessage(validCapabilityMessage());

    document.body.innerHTML = '<main id="app"></main>';
    const reloadRoot = document.getElementById('app')!;
    await bootstrapPlay(reloadRoot);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('does not log or throw the raw capability token on receive or fetch', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    acceptSeatCapabilityPostMessage();
    postCapabilityMessage(validCapabilityMessage());

    const fetchMock = vi.fn(async () => {
      throw new Error('network failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(seatScopedFetch('/v1/table/seats/me')).rejects.toThrow('network failed');

    for (const call of consoleSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TEST_CAPABILITY);
    }
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TEST_CAPABILITY);
    }

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
