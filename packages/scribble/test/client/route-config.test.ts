import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/client/config.js';
import { parseRoute, tablePath } from '../../src/client/route.js';

describe('routes', () => {
  it('lists tables at /scribble and enters one at /scribble/<tableId>', () => {
    expect(parseRoute('/scribble')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/scribble/')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/scribble/index.html')).toEqual({ kind: 'lobby' });
    expect(parseRoute('/scribble/7c9e6679-7425-40de-944b-e07fc1f90ae7')).toEqual({
      kind: 'table',
      tableId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
    expect(tablePath('abc-1')).toBe('/scribble/abc-1');
  });

  it('treats anything deeper or outside the base as unknown', () => {
    expect(parseRoute('/scribble/a/b')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/scribble/%3Cscript%3E')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/riffle/abc')).toEqual({ kind: 'not_found' });
    expect(parseRoute('/scribbles')).toEqual({ kind: 'not_found' });
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
    expect(parseConfig({ webSocketUrl: 'ws://localhost:5180/ws', auth: { userPoolId: 'nope' }, dev: 'yes' })).toEqual({
      webSocketUrl: 'ws://localhost:5180/ws',
    });
  });
});
