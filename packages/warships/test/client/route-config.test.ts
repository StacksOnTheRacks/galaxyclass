import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/client/config.js';
import { DEV_TOKEN_KEY } from '../../src/client/player-token.js';
import { parseRoute, tablePath } from '../../src/client/route.js';

describe('routes', () => {
  it('lists tables at /warships and enters one at /warships/<tableId>', () => {
    expect(parseRoute('/warships')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/warships/')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/warships/index.html')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/warships/7c9e6679-7425-40de-944b-e07fc1f90ae7')).toEqual({
      kind: 'table',
      tableId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
    expect(tablePath('abc-1')).toBe('/warships/abc-1');
  });

  it('treats anything deeper or outside the base as unknown', () => {
    expect(parseRoute('/warships/a/b')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/warships/%3Cscript%3E')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/scribble/abc')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/warshipss')).toEqual({ kind: 'not_found' });
  });
});

describe('config.json', () => {
  it('keeps the socket url and public auth ids, and drops everything else', () => {
    const config = parseConfig({
      webSocketUrl: 'wss://abc.execute-api.us-east-1.amazonaws.com/prod',
      auth: { userPoolId: 'us-east-1_AbC123', userPoolClientId: 'abc123def' },
      secret: 'ignored',
    });
    expect(config).toEqual({
      webSocketUrl: 'wss://abc.execute-api.us-east-1.amazonaws.com/prod',
      auth: { userPoolId: 'us-east-1_AbC123', userPoolClientId: 'abc123def' },
    });
  });

  it('rejects a missing or non-WebSocket url, ignores malformed auth, and only honours dev when true', () => {
    expect(parseConfig({ webSocketUrl: 'https://x' })).toBeNull();
    expect(parseConfig(null)).toBeNull();
    expect(parseConfig({ webSocketUrl: 'ws://localhost:5182/ws', auth: { userPoolId: 'nope' }, dev: 'yes' })).toEqual({
      webSocketUrl: 'ws://localhost:5182/ws',
    });
    expect(parseConfig({ webSocketUrl: 'ws://localhost:5182/ws', dev: true })).toEqual({ webSocketUrl: 'ws://localhost:5182/ws', dev: true });
  });

  it('keeps its own dev token key, apart from Scribble', () => {
    expect(DEV_TOKEN_KEY).toBe('warships.devAccessToken');
  });
});
