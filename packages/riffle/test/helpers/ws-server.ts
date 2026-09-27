import { serve } from '@hono/node-server';
import WebSocket from 'ws';
import { attachWsUpgrade } from '../../src/ws/index.js';
import { createTestApp, type TestAppOptions } from './test-app.js';
import { TEST_FRAME_ANCESTORS, TEST_HOST_API_KEY, TEST_PUBLIC_ORIGIN } from './fixtures.js';

export interface TestWsServer {
  port: number;
  wsHub: ReturnType<typeof createTestApp>['wsHub'];
  verifyPlayBearer: ReturnType<typeof createTestApp>['verifyPlayBearer'];
  close: () => Promise<void>;
}

export async function createTestWsServer(options: TestAppOptions = {}): Promise<TestWsServer> {
  const { app, wsHub, verifyPlayBearer } = createTestApp(options);
  const server = serve({
    fetch: app.fetch,
    port: 0,
  });

  attachWsUpgrade(server, {
    hub: wsHub,
    verifyPlayBearer,
    env: {
      hostApiKey: TEST_HOST_API_KEY,
      publicOrigin: TEST_PUBLIC_ORIGIN,
      listenPort: 0,
      frameAncestors: TEST_FRAME_ANCESTORS,
      labEnabled: false,
    },
  });

  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.once('listening', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test ws server');
  }

  return {
    port: address.port,
    wsHub,
    verifyPlayBearer,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

export function openTestWebSocket(
  port: number,
  path = '/v1/ws',
  headers: Record<string, string> = {},
): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
}

export function waitForMessage<T = unknown>(socket: WebSocket, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('message timeout'));
    }, timeoutMs);

    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as T);
    });
  });
}

export function waitForClose(socket: WebSocket, timeoutMs = 2500): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('close timeout'));
    }, timeoutMs);

    socket.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

export function waitForUpgradeRejection(socket: WebSocket, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('upgrade rejection timeout'));
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timer);
      resolve();
    };

    socket.once('error', finish);
    socket.once('close', finish);
  });
}
