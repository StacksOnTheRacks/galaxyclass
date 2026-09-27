import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createIdentityStore } from '../../src/identity/store.js';
import { mintSeatCapabilityToken } from '../../src/server/seats/capability/token.js';
import { TEST_HOST_API_KEY, TEST_MATCH_ID } from '../helpers/fixtures.js';
import {
  createTestWsServer,
  openTestWebSocket,
  waitForClose,
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

describe('ws subscribe auth', () => {
  const servers: Array<Awaited<ReturnType<typeof createTestWsServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it('rejects missing authorization and non-identity credentials', async () => {
    const identityStore = createIdentityStore();
    const server = await createTestWsServer({ stores: { identityStore } });
    servers.push(server);

    const missing = openTestWebSocket(server.port);
    await waitForOpen(missing);
    missing.send(JSON.stringify({ type: 'subscribe', matchId: TEST_MATCH_ID }));
    const missingClose = await waitForClose(missing);
    expect(missingClose.reason).toBe('unauthorized');

    const hostKey = openTestWebSocket(server.port);
    await waitForOpen(hostKey);
    hostKey.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: `Bearer ${TEST_HOST_API_KEY}`,
      }),
    );
    expect((await waitForClose(hostKey)).reason).toBe('unauthorized');

    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature';
    const hostJwt = openTestWebSocket(server.port);
    await waitForOpen(hostJwt);
    hostJwt.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: `Bearer ${jwt}`,
      }),
    );
    expect((await waitForClose(hostJwt)).reason).toBe('unauthorized');

    const seatCapability = openTestWebSocket(server.port);
    await waitForOpen(seatCapability);
    seatCapability.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: `Bearer ${mintSeatCapabilityToken()}`,
      }),
    );
    expect((await waitForClose(seatCapability)).reason).toBe('unauthorized');
  });

  it('rejects upgrade Authorization with host key, jwt, and seat capability header', async () => {
    const server = await createTestWsServer();
    servers.push(server);

    const hostKeySocket = openTestWebSocket(server.port, '/v1/ws', {
      Authorization: `Bearer ${TEST_HOST_API_KEY}`,
    });
    await waitForOpen(hostKeySocket);
    hostKeySocket.send(JSON.stringify({ type: 'subscribe', matchId: TEST_MATCH_ID }));
    expect((await waitForClose(hostKeySocket)).reason).toBe('unauthorized');

    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature';
    const jwtSocket = openTestWebSocket(server.port, '/v1/ws', {
      Authorization: `Bearer ${jwt}`,
    });
    await waitForOpen(jwtSocket);
    jwtSocket.send(JSON.stringify({ type: 'subscribe', matchId: TEST_MATCH_ID }));
    expect((await waitForClose(jwtSocket)).reason).toBe('unauthorized');

    const seatHeaderSocket = openTestWebSocket(server.port, '/v1/ws', {
      'X-Riffle-Seat-Capability': mintSeatCapabilityToken(),
    });
    await waitForUpgradeRejection(seatHeaderSocket);
  });

  it('accepts injected verifyPlayBearer without identity store wiring', async () => {
    const server = await createTestWsServer({
      verifyPlayBearer: (token) =>
        token === 'injected-bearer' ? { playerSubject: 'player-1' } : undefined,
    });
    servers.push(server);

    const socket = openTestWebSocket(server.port);
    await waitForOpen(socket);
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: TEST_MATCH_ID,
        authorization: 'Bearer injected-bearer',
      }),
    );

    await new Promise<void>((resolve, reject) => {
      socket.once('message', (data) => {
        const frame = JSON.parse(data.toString()) as { type: string };
        expect(frame.type).toBe('subscribed');
        resolve();
      });
      socket.once('close', () => reject(new Error('unexpected close')));
    });

    socket.close();
  });
});
