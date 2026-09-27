// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';
import {
  attachPublicTableNotify,
  buildPublicTableWsUrl,
} from '../../src/client/table-notify.js';
import { TEST_MATCH_ID } from '../helpers/fixtures.js';

describe('table-notify client', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('builds ws url without token or matchId', () => {
    expect(buildPublicTableWsUrl({ protocol: 'https:', host: 'play.example' })).toBe(
      'wss://play.example/v1/ws',
    );
    expect(buildPublicTableWsUrl({ protocol: 'http:', host: 'localhost:3000' })).toBe(
      'ws://localhost:3000/v1/ws',
    );
  });

  it('does not open ws without stored bearer', () => {
    const wsFactory = vi.fn();
    const handle = attachPublicTableNotify({
      matchId: TEST_MATCH_ID,
      onRefresh: vi.fn(),
      wsFactory,
    });
    expect(handle).toBeUndefined();
    expect(wsFactory).not.toHaveBeenCalled();
  });

  it('sends bearer in first control frame after connect', async () => {
    const sends: string[] = [];
    const MockWebSocket = class {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = MockWebSocket.CONNECTING;
      send = vi.fn((payload: string) => {
        sends.push(payload);
      });
      close = vi.fn();
      addEventListener(type: string, listener: () => void) {
        if (type === 'open') {
          queueMicrotask(() => {
            this.readyState = MockWebSocket.OPEN;
            listener();
          });
        }
      }
    };

    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'opaque-bearer', playerSubject: 'anon:1' }),
    );

    attachPublicTableNotify({
      matchId: TEST_MATCH_ID,
      onRefresh: vi.fn(),
      wsFactory: () => new MockWebSocket() as unknown as WebSocket,
      wsUrl: 'ws://localhost/v1/ws',
    });

    await Promise.resolve();
    expect(JSON.parse(sends[0]!)).toEqual({
      type: 'subscribe',
      matchId: TEST_MATCH_ID,
      authorization: 'Bearer opaque-bearer',
    });
  });
});
