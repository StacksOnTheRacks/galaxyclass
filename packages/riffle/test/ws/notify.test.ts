// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createIdentityStore } from '../../src/identity/store.js';
import { TEST_MATCH_ID } from '../helpers/fixtures.js';
import {
  createTestWsServer,
  openTestWebSocket,
  waitForMessage,
} from '../helpers/ws-server.js';

describe('notifyPublicTable', () => {
  const servers: Array<Awaited<ReturnType<typeof createTestWsServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it('delivers refresh to subscribed clients after simulated board advance', async () => {
    const identityStore = createIdentityStore();
    const issued = identityStore.issueAnonymous();
    const server = await createTestWsServer({ stores: { identityStore } });
    servers.push(server);

    const socket = openTestWebSocket(server.port);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', (error) => reject(error));
    });
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: `Bearer ${issued.bearer}`,
      }),
    );
    await waitForMessage(socket);

    const cursor = server.wsHub.notifyPublicTable(TEST_MATCH_ID);
    expect(cursor).toBe(1);

    const frame = await waitForMessage<{ type: string; matchId: string; cursor: number }>(socket);
    expect(frame).toEqual({
      type: 'table.refresh',
      matchId: TEST_MATCH_ID,
      cursor: 1,
    });

    socket.close();
  });

  it('does not treat push as mutation success on the play client', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { attachPublicTableNotify } = await import('../../src/client/table-notify.js');
    const refresh = vi.fn();

    const listeners = new Map<string, Set<(event: { data: string }) => void>>();
    const MockWebSocket = class {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      send = vi.fn();
      close = vi.fn();
      addEventListener(type: string, listener: (event: { data: string }) => void) {
        const bucket = listeners.get(type) ?? new Set();
        bucket.add(listener);
        listeners.set(type, bucket);
        if (type === 'open') {
          queueMicrotask(() => listener({ data: '' }));
        }
      }
    };
    let socket!: InstanceType<typeof MockWebSocket>;

    sessionStorage.setItem(
      'riffle.identity.session',
      JSON.stringify({ bearer: 'play-bearer', playerSubject: 'anon:test' }),
    );

    attachPublicTableNotify({
      matchId: TEST_MATCH_ID,
      onRefresh: refresh,
      wsFactory: (url) => {
        expect(url).not.toContain('play-bearer');
        expect(url).toBe('ws://localhost/v1/ws');
        socket = new MockWebSocket();
        return socket as unknown as WebSocket;
      },
      wsUrl: 'ws://localhost/v1/ws',
    });

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();

    for (const listener of listeners.get('message') ?? []) {
      listener({
        data: JSON.stringify({ type: 'table.refresh', matchId: TEST_MATCH_ID, cursor: 1 }),
      });
    }

    expect(refresh).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
