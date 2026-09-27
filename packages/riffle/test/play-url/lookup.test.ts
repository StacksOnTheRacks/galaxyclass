import { describe, expect, it } from 'vitest';
import { createMatchStore } from '../../src/match-store/index.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /v1/play/matches/:matchId', () => {
  it('returns matchId for seeded match without hidden fields', async () => {
    const matchStore = createMatchStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { app } = createTestApp({ stores: { matchStore } });
    const response = await app.request(`/v1/play/matches/${created.value.matchId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body).toEqual({ matchId: created.value.matchId });
    expect(body.seats).toBeUndefined();
    expect(body.hole).toBeUndefined();
    expect(body.playerSubject).toBeUndefined();
  });

  it('returns 404 match_not_found for unknown matchId', async () => {
    const { app } = createTestApp();
    const response = await app.request('/v1/play/matches/m_unknown0000000000');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'match_not_found' });
  });

  it('returns 404 match_not_found for malformed matchId without auth', async () => {
    const { app } = createTestApp();
    const response = await app.request('/v1/play/matches/not-a-valid-id');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'match_not_found' });
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });
});
