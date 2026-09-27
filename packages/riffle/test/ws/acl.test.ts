import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createIdentityStore } from '../../src/identity/store.js';
import { TEST_MATCH_ID } from '../helpers/fixtures.js';
import {
  createTestWsServer,
  openTestWebSocket,
  waitForClose,
  waitForMessage,
} from '../helpers/ws-server.js';

describe('ws topic acl', () => {
  const servers: Array<Awaited<ReturnType<typeof createTestWsServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it('rejects hidden, seat-scoped, and write matchId prefixes', async () => {
    const identityStore = createIdentityStore();
    const issued = identityStore.issueAnonymous();
    const server = await createTestWsServer({ stores: { identityStore } });
    servers.push(server);

    for (const matchId of ['hidden:abc', 'seat:abc', 'view:abc', 'write:abc']) {
      const socket = openTestWebSocket(server.port);
      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', (error) => reject(error));
      });
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          matchId,
          authorization: `Bearer ${issued.bearer}`,
        }),
      );
      const closed = await waitForClose(socket);
      expect(closed.code).toBe(1008);
      expect(closed.reason).toBe('forbidden_topic');
    }
  });

  it('public refresh frames contain only type, matchId, and cursor', async () => {
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

    server.wsHub.notifyPublicTable(TEST_MATCH_ID);
    const frame = await waitForMessage<Record<string, unknown>>(socket);

    expect(Object.keys(frame).sort()).toEqual(['cursor', 'matchId', 'type']);
    expect(frame.type).toBe('table.refresh');
    expect(frame.matchId).toBe(TEST_MATCH_ID);
    expect(frame).not.toHaveProperty('hole');
    expect(frame).not.toHaveProperty('holes');
    expect(frame).not.toHaveProperty('holeCards');
    expect(frame).not.toHaveProperty('hiddenView');
    expect(frame).not.toHaveProperty('view');
    expect(frame).not.toHaveProperty('HandState');

    socket.close();
  });
});
