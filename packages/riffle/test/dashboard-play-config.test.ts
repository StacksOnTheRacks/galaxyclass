import { describe, expect, it } from 'vitest';
import { loadPlayConfig } from '../src/client/dashboard-play/config.js';

function fetchJson(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
}

const base = { webSocketUrl: 'wss://example.execute-api.us-east-1.amazonaws.com/prod', tables: [] };

describe('loadPlayConfig auth', () => {
  it('parses the studio user pool and app client', async () => {
    const config = await loadPlayConfig(
      fetchJson({ ...base, auth: { userPoolId: 'us-east-1_AbC123', userPoolClientId: 'abc123def456' } }),
    );
    expect(config?.auth).toEqual({ userPoolId: 'us-east-1_AbC123', userPoolClientId: 'abc123def456' });
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'us-east-1_AbC123'],
    ['bad pool id', { userPoolId: 'https://evil.example/', userPoolClientId: 'abc123' }],
    ['bad client id', { userPoolId: 'us-east-1_AbC123', userPoolClientId: 'ABC 123' }],
  ])('omits auth when it is %s', async (_label, auth) => {
    const config = await loadPlayConfig(fetchJson({ ...base, auth }));
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty('auth');
  });
});
