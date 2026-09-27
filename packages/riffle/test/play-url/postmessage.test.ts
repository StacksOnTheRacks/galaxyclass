// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptSharedPlayPostMessage,
  resetSharedPlayBindings,
} from '../../src/client/play-url.js';
import { SEAT_CAPABILITY_MESSAGE_TYPE } from '../../src/client/seat-capability.js';
import { TABLE_REFRESH_MESSAGE_TYPE } from '../../src/client/table-refresh.js';

function postMessage(data: unknown, origin: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin,
    }),
  );
}

describe('shared play URL postMessage', () => {
  beforeEach(() => {
    resetSharedPlayBindings();
    document.body.innerHTML =
      '<meta name="riffle-embed-ancestors" content="https://host.example" />';
  });

  it('ignores messages from non-allowlisted origins', () => {
    const handler = vi.fn();
    window.addEventListener('message', handler);
    acceptSharedPlayPostMessage([window.location.origin, 'https://host.example']);

    postMessage({ type: TABLE_REFRESH_MESSAGE_TYPE }, 'https://evil.example');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('drops attach, sit, grant, bootstrap, and capability messages', () => {
    acceptSharedPlayPostMessage([window.location.origin]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    postMessage({ attach: true, type: TABLE_REFRESH_MESSAGE_TYPE }, window.location.origin);
    postMessage({ sit: true }, window.location.origin);
    postMessage({ grant: 'seat' }, window.location.origin);
    postMessage({ token: 'secret' }, window.location.origin);
    postMessage(
      { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability: 'a'.repeat(64) },
      window.location.origin,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts allowlisted table refresh without side effects', () => {
    acceptSharedPlayPostMessage([window.location.origin]);
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    postMessage({ type: TABLE_REFRESH_MESSAGE_TYPE }, window.location.origin);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/bootstrap/redeem'),
      expect.anything(),
    );
  });
});
