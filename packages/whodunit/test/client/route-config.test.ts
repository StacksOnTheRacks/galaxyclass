import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/client/config.js';
import { DEV_TOKEN_KEY } from '../../src/client/player-token.js';
import { parseRoute, tablePath } from '../../src/client/route.js';

describe('routes', () => {
  it('lists tables at /whodunit and enters one at /whodunit/<tableId>', () => {
    expect(parseRoute('/whodunit')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/whodunit/')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/whodunit/index.html')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/whodunit/7c9e6679-7425-40de-944b-e07fc1f90ae7')).toEqual({
      kind: 'table',
      tableId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
    expect(tablePath('abc-1')).toBe('/whodunit/abc-1');
  });

  it('treats anything deeper or outside the base as unknown', () => {
    expect(parseRoute('/whodunit/a/b')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/whodunit/%3Cscript%3E')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/warships/abc')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/whodunitt')).toEqual({ kind: 'not_found' });
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
    expect(parseConfig({ webSocketUrl: 'ws://localhost:5183/ws', auth: { userPoolId: 'nope' }, dev: 'yes' })).toEqual({
      webSocketUrl: 'ws://localhost:5183/ws',
    });
    expect(parseConfig({ webSocketUrl: 'ws://localhost:5183/ws', dev: true })).toEqual({ webSocketUrl: 'ws://localhost:5183/ws', dev: true });
  });

  it('keeps its own dev token key, apart from the other games', () => {
    expect(DEV_TOKEN_KEY).toBe('whodunit.devAccessToken');
  });
});
