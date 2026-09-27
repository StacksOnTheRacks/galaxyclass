import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { createTestApp } from '../helpers/test-app.js';
import { TEST_HOST_API_KEY } from '../helpers/fixtures.js';

function seedMatch() {
  const matchStore = createMatchStore();
  const identityStore = createIdentityStore();
  const created = matchStore.createMatch();
  if (!created.ok) {
    throw new Error('create failed');
  }
  const { app } = createTestApp({ stores: { matchStore, identityStore } });
  return { app, matchStore, matchId: created.value.matchId };
}

describe('sit authority rejects', () => {
  it('rejects cookie-only sit', async () => {
    const { app, matchStore, matchId } = seedMatch();
    const response = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Cookie: 'riffle_play=sess-token',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(401);
    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.every((seat) => seat.playerSubject === null)).toBe(true);
  });

  it('rejects host API key bearer', async () => {
    const { app, matchId } = seedMatch();
    const response = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_HOST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  it('rejects JWT-shaped bearer', async () => {
    const { app, matchId } = seedMatch();
    const response = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  it('ignores X-Riffle-Seat-Capability header', async () => {
    const { app, matchStore, matchId } = seedMatch();
    const response = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        'X-Riffle-Seat-Capability': 'capability-token',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(401);
    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.every((seat) => seat.playerSubject === null)).toBe(true);
  });
});
