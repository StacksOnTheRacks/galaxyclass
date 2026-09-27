import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildPublicTableWsUrl } from '../../src/client/table-notify.js';
import { createIdentityStore } from '../../src/identity/store.js';
import { TEST_MATCH_ID } from '../helpers/fixtures.js';
import {
  createTestWsServer,
  openTestWebSocket,
  waitForClose,
  waitForMessage,
  waitForUpgradeRejection,
} from '../helpers/ws-server.js';

async function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', (error) => reject(error));
  });
}

describe('ws subscribe', () => {
  const servers: Array<Awaited<ReturnType<typeof createTestWsServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it('browser client sends IdentityStore bearer in first control frame and subscribes', async () => {
    const identityStore = createIdentityStore();
    const issued = identityStore.issueAnonymous();
    const server = await createTestWsServer({ stores: { identityStore } });
    servers.push(server);

    const socket = openTestWebSocket(server.port);
    await waitForOpen(socket);
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: `Bearer ${issued.bearer}`,
      }),
    );

    const ack = await waitForMessage<{ type: string; matchId: string; topic: string }>(socket);
    expect(ack).toEqual({
      type: 'subscribed',
      matchId: TEST_MATCH_ID,
      topic: `table:${TEST_MATCH_ID}`,
    });

    socket.close();
  });

  it('non-browser client can subscribe with handshake Authorization', async () => {
    const identityStore = createIdentityStore();
    const issued = identityStore.issueAnonymous();
    const server = await createTestWsServer({ stores: { identityStore } });
    servers.push(server);

    const socket = openTestWebSocket(server.port, '/v1/ws', {
      Authorization: `Bearer ${issued.bearer}`,
    });
    await waitForOpen(socket);
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
      }),
    );

    const ack = await waitForMessage<{ type: string; topic: string }>(socket);
    expect(ack.type).toBe('subscribed');
    expect(ack.topic).toBe(`table:${TEST_MATCH_ID}`);

    socket.close();
  });

  it('rejects token in URL query, hash, or Sec-WebSocket-Protocol', async () => {
    const identityStore = createIdentityStore();
    const issued = identityStore.issueAnonymous();
    const server = await createTestWsServer({ stores: { identityStore } });
    servers.push(server);

    const querySocket = new WebSocket(
      `ws://127.0.0.1:${server.port}/v1/ws?token=${issued.bearer}`,
    );
    await waitForUpgradeRejection(querySocket);
    expect(buildPublicTableWsUrl({ protocol: 'http:', host: `127.0.0.1:${server.port}` })).not.toContain(
      issued.bearer,
    );

    const protocolSocket = new WebSocket(`ws://127.0.0.1:${server.port}/v1/ws`, {
      headers: {
        'Sec-WebSocket-Protocol': issued.bearer,
      },
    });
    await waitForUpgradeRejection(protocolSocket);

    const validSocket = openTestWebSocket(server.port);
    await waitForOpen(validSocket);
    validSocket.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: `Bearer ${issued.bearer}`,
      }),
    );
    const ack = await waitForMessage<{ type: string }>(validSocket);
    expect(ack.type).toBe('subscribed');
    validSocket.close();
  });

  it('closes when no valid subscribe within 2000 ms', async () => {
    const server = await createTestWsServer();
    servers.push(server);

    const socket = openTestWebSocket(server.port);
    const closed = await waitForClose(socket, 3000);
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('subscribe_timeout');
  });
});
