import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { createTestApp } from '../helpers/test-app.js';
import { TEST_HOST_API_KEY } from '../helpers/fixtures.js';

function seedTwoSeats() {
  const matchStore = createMatchStore();
  const identityStore = createIdentityStore();
  const created = matchStore.createMatch();
  if (!created.ok) {
    throw new Error('create failed');
  }
  const matchId = created.value.matchId;
  const anonA = identityStore.issueAnonymous();
  const anonB = identityStore.issueAnonymous();
  const sitA = matchStore.claimEmptySeat(matchId, anonA.playerSubject);
  const sitB = matchStore.claimEmptySeat(matchId, anonB.playerSubject);
  if (!sitA.ok || !sitB.ok) {
    throw new Error('sit failed');
  }
  const { app } = createTestApp({ stores: { matchStore, identityStore } });
  return {
    app,
    matchStore,
    matchId,
    seatA: sitA.value.seatId,
    seatB: sitB.value.seatId,
    bearerA: anonA.bearer,
    bearerB: anonB.bearer,
  };
}

describe('display-name authority', () => {
  it('rejects unseated bearer', async () => {
    const matchStore = createMatchStore();
    const identityStore = createIdentityStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }
    const unseated = identityStore.issueAnonymous();
    const { app } = createTestApp({ stores: { matchStore, identityStore } });

    const response = await app.request(
      `/v1/play/matches/${created.value.matchId}/display-name`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${unseated.bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'LuckyAce' }),
      },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_seated' });
  });

  it('each seat writes only its own displayName', async () => {
    const { app, matchStore, matchId, seatA, bearerB } = seedTwoSeats();

    const response = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(response.status).toBe(200);

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.find((seat) => seat.seatId === seatA)?.displayName).toBeNull();
  });

  it('rejects seatId and playerSubject in body', async () => {
    const { app, matchStore, matchId, bearerA, seatB } = seedTwoSeats();

    const seatIdBody = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce', seatId: seatB }),
    });
    expect(seatIdBody.status).toBe(400);
    expect(await seatIdBody.json()).toEqual({ error: 'invalid_body' });

    const subjectBody = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce', playerSubject: 'anon:other' }),
    });
    expect(subjectBody.status).toBe(400);
    expect(await subjectBody.json()).toEqual({ error: 'invalid_body' });

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.every((seat) => seat.displayName === null)).toBe(true);
  });

  it('rejects client-supplied state keys', async () => {
    const { app, matchId, bearerA } = seedTwoSeats();
    const response = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce', stack: 5000 }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'client_supplied_state' });
  });

  it('rejects cookie-only, host key, JWT-shaped, and capability headers', async () => {
    const { app, matchStore, matchId } = seedTwoSeats();

    const cookie = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Cookie: 'riffle_play=sess-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(cookie.status).toBe(401);

    const hostKey = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_HOST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(hostKey.status).toBe(401);

    const jwt = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(jwt.status).toBe(401);

    const capability = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        'X-Riffle-Seat-Capability': 'capability-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(capability.status).toBe(401);

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.every((seat) => seat.displayName === null)).toBe(true);
  });
});
