// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptSeatCapabilityPostMessage,
  clearStoredSeatCapability,
  SEAT_CAPABILITY_MESSAGE_TYPE,
} from '../src/client/seat-capability.js';
import { postSeatCapabilityToIframe } from '../src/client/lab/post-capability.js';
import { bootstrapLabHarness, dealHand, startSession } from '../src/client/lab.js';
import { TABLE_CHANGED_MESSAGE_TYPE, TABLE_REFRESH_MESSAGE_TYPE } from '../src/client/table-refresh.js';
import { TEST_MATCH_ID, TEST_PUBLIC_ORIGIN } from './helpers/fixtures.js';
import * as bootstrapMint from '../src/server/bootstrap/mint.js';
import * as capabilityMint from '../src/server/seats/capability/mint.js';
import {
  createFakeSeatStore,
  createFakeTurnurClientWithSeats,
} from './helpers/fake-turnur-seats.js';
import { createTestApp } from './helpers/test-app.js';

const projectRoot = join(import.meta.dirname, '..');
const CAP_A = 'a'.repeat(64);
const CAP_B = 'b'.repeat(64);

function mountLabShell(): void {
  document.body.innerHTML = readFileSync(join(projectRoot, 'public', 'lab.html'), 'utf8');
}

function mockSessionResponse(
  seats: Array<{ playUrl: string; capabilityToken: string; seatId: string }>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/v1/lab/session')) {
        return new Response(
          JSON.stringify({
            matchId: TEST_MATCH_ID,
            seats: seats.map((seat) => ({
              seatId: seat.seatId,
              playUrl: seat.playUrl,
              capabilityToken: seat.capabilityToken,
              playerSubject: `lab:${seat.seatId}`,
            })),
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/v1/lab/deal')) {
        return new Response(JSON.stringify({ matchId: TEST_MATCH_ID, currentSeat: 'seat-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    }),
  );
}

describe('lab page harness', () => {
  beforeEach(() => {
    mountLabShell();
    window.history.replaceState(null, '', '/lab');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearStoredSeatCapability();
  });

  it('GET /lab serves harness HTML with no session side effects', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const matchCreateSpy = vi.spyOn(fakeClient.match, 'create');

    const { app } = createTestApp({
      labEnabled: true,
      matchDeps: { getClient },
      seatDeps: { getClient },
      labDeps: { getClient, getRemoteAddress: () => '127.0.0.1' },
    });

    const response = await app.request('/lab');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.text()).toContain('id="lab-app"');
    expect(matchCreateSpy).not.toHaveBeenCalled();
  });

  it('does not access iframe contentDocument in lab client source', () => {
    const labSource = readFileSync(join(projectRoot, 'src', 'client', 'lab.ts'), 'utf8');
    const postCapabilitySource = readFileSync(
      join(projectRoot, 'src', 'client', 'lab', 'post-capability.ts'),
      'utf8',
    );
    expect(labSource).not.toMatch(/contentDocument/);
    expect(postCapabilitySource).not.toMatch(/contentDocument/);
  });

  it('delivers capabilities to each iframe with targeted postMessage on load', async () => {
    const playUrl1 = `${TEST_PUBLIC_ORIGIN}/play#bt=token-one`;
    const playUrl2 = `${TEST_PUBLIC_ORIGIN}/play#bt=token-two`;

    mockSessionResponse([
      { seatId: 'seat-1', playUrl: playUrl1, capabilityToken: CAP_A },
      { seatId: 'seat-2', playUrl: playUrl2, capabilityToken: CAP_B },
    ]);

    bootstrapLabHarness();
    const root = document.getElementById('lab-app')!;
    const postMessageSpies: Array<ReturnType<typeof vi.spyOn>> = [];

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'iframe') {
        const mockWindow = {
          postMessage: vi.fn(),
        } as unknown as Window;
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          get: () => mockWindow,
        });
        postMessageSpies.push(vi.spyOn(mockWindow, 'postMessage'));
        queueMicrotask(() => {
          element.dispatchEvent(new Event('load'));
        });
      }
      return element;
    });

    await startSession();

    expect(root.dataset.state).toBe('lab-two-seats');
    const calledSpies = postMessageSpies.filter((spy) => spy.mock.calls.length > 0);
    expect(calledSpies).toHaveLength(2);

    expect(calledSpies[0]).toHaveBeenCalledWith(
      { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: CAP_A },
      window.location.origin,
    );
    expect(calledSpies[1]).toHaveBeenCalledWith(
      { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: CAP_B },
      window.location.origin,
    );
    expect(calledSpies[0]?.mock.calls[0]?.[1]).not.toBe('*');
  });

  it('does not cross-store seat capabilities between iframe contexts', () => {
    acceptSeatCapabilityPostMessage();

    const iframe1 = document.createElement('iframe');
    const iframe2 = document.createElement('iframe');
    const window1 = { postMessage: vi.fn() } as unknown as Window;
    const window2 = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe1, 'contentWindow', { configurable: true, get: () => window1 });
    Object.defineProperty(iframe2, 'contentWindow', { configurable: true, get: () => window2 });

    postSeatCapabilityToIframe(iframe1, CAP_A);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: CAP_A },
        origin: window.location.origin,
      }),
    );

    postSeatCapabilityToIframe(iframe2, CAP_B);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: CAP_B },
        origin: window.location.origin,
      }),
    );

    expect(window1.postMessage).toHaveBeenCalledOnce();
    expect(window2.postMessage).toHaveBeenCalledOnce();
  });

  it('shows lab-harness-error when session start fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'lab_disabled' }), { status: 403 })),
    );

    bootstrapLabHarness();
    await startSession();

    const root = document.getElementById('lab-app')!;
    expect(root.dataset.state).toBe('lab-harness-error');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Lab session');
    expect(document.body.textContent).not.toContain(CAP_A);
  });

  it('calls deal orchestrator when both seats are attached', async () => {
    const playUrl1 = `${TEST_PUBLIC_ORIGIN}/play#bt=token-one`;
    const playUrl2 = `${TEST_PUBLIC_ORIGIN}/play#bt=token-two`;
    mockSessionResponse([
      { seatId: 'seat-1', playUrl: playUrl1, capabilityToken: CAP_A },
      { seatId: 'seat-2', playUrl: playUrl2, capabilityToken: CAP_B },
    ]);

    bootstrapLabHarness();

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'iframe') {
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          get: () => ({ postMessage: vi.fn() }) as unknown as Window,
        });
        queueMicrotask(() => element.dispatchEvent(new Event('load')));
      }
      return element;
    });

    await startSession();
    await dealHand();

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/lab/deal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ matchId: TEST_MATCH_ID }),
      }),
    );
  });

  it('rebroadcasts a seat tableChanged message as tableRefresh to both iframes', async () => {
    const playUrl1 = `${TEST_PUBLIC_ORIGIN}/play#bt=token-one`;
    const playUrl2 = `${TEST_PUBLIC_ORIGIN}/play#bt=token-two`;
    mockSessionResponse([
      { seatId: 'seat-1', playUrl: playUrl1, capabilityToken: CAP_A },
      { seatId: 'seat-2', playUrl: playUrl2, capabilityToken: CAP_B },
    ]);

    bootstrapLabHarness();

    const postMessageSpies: Array<ReturnType<typeof vi.fn>> = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'iframe') {
        const postMessage = vi.fn();
        postMessageSpies.push(postMessage);
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          get: () => ({ postMessage }) as unknown as Window,
        });
        queueMicrotask(() => element.dispatchEvent(new Event('load')));
      }
      return element;
    });

    await startSession();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: TABLE_CHANGED_MESSAGE_TYPE },
      }),
    );

    const refreshCalls = postMessageSpies.flatMap((spy) =>
      spy.mock.calls.filter((call) => call[0]?.type === TABLE_REFRESH_MESSAGE_TYPE),
    );
    expect(refreshCalls).toHaveLength(2);
  });
});

describe('lab session integration with fake Turnur', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Start session uses only POST /v1/lab/session through the test app', async () => {
    vi.spyOn(bootstrapMint, 'mintBootstrap');
    vi.spyOn(capabilityMint, 'mintSeatCapability');

    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({
      labEnabled: true,
      matchDeps: { getClient },
      seatDeps: { getClient },
      labDeps: { getClient, getRemoteAddress: () => '127.0.0.1' },
    });

    const response = await app.request('/v1/lab/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      matchId: string;
      seats: Array<{ playUrl: string; capabilityToken: string }>;
    };
    expect(body.seats).toHaveLength(2);
    for (const seat of body.seats) {
      expect(seat.playUrl).toMatch(/#bt=/);
      expect(seat.playUrl).not.toMatch(/[?&]bt=/);
    }
  });
});
