import { describe, expect, it } from 'vitest';
import { createMatchStore } from '../../src/match-store/index.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /play/:matchId', () => {
  it('serves play shell with shared-path security headers', async () => {
    const matchStore = createMatchStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { app } = createTestApp({ stores: { matchStore } });
    const response = await app.request(`/play/${created.value.matchId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const csp = response.headers.get('Content-Security-Policy') ?? '';
    const frameAncestors = csp.split(';')[0] ?? '';
    expect(frameAncestors).toContain("frame-ancestors 'self'");
    expect(frameAncestors).toContain('https://host.example');
    expect(frameAncestors).not.toContain('*');
    expect(frameAncestors).not.toMatch(/'none'|\bnone\b/);

    const html = await response.text();
    expect(html).toContain('id="app"');
    expect(html).toContain('<title>Riffle Poker table</title>');
    expect(html).toContain('name="riffle-embed-ancestors"');
    expect(html).toContain('content="https://host.example"');
  });

  it('serves identical CSP with and without embed=1', async () => {
    const matchStore = createMatchStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { app } = createTestApp({ stores: { matchStore } });
    const matchId = created.value.matchId;

    const standalone = await app.request(`/play/${matchId}`);
    const embed = await app.request(`/play/${matchId}?embed=1`);

    expect(standalone.headers.get('Content-Security-Policy')).toBe(
      embed.headers.get('Content-Security-Policy'),
    );
  });

  it('returns 200 play shell for unknown matchId', async () => {
    const { app } = createTestApp();
    const response = await app.request('/play/m_unknown0000000000');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="app"');
  });
});
