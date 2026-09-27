import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { createTestApp } from '../helpers/test-app.js';

const HIDDEN_KEYS = [
  'hole',
  'holes',
  'holeCards',
  'hiddenView',
  'view',
  'HandState',
  'shoe',
  'deckRemaining',
  'burns',
];

function seedMatch() {
  const matchStore = createMatchStore();
  const identityStore = createIdentityStore();
  const created = matchStore.createMatch();
  if (!created.ok) {
    throw new Error('create failed');
  }
  const { app } = createTestApp({ stores: { matchStore, identityStore } });
  return { app, matchStore, identityStore, matchId: created.value.matchId };
}

describe('sit routes', () => {
  it('account bearer sit writes playerSubject on first empty seat with null displayName', async () => {
    const { app, matchStore, identityStore, matchId } = seedMatch();
    const account = await identityStore.signUp('player@example.com', 'password123');
    if (!account.ok) {
      throw new Error('sign up failed');
    }

    const response = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.value.bearer}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const body = (await response.json()) as {
      matchId: string;
      seatId: string;
      seats: Array<{ playerSubject: string | null; displayName: string | null }>;
    };
    expect(body.matchId).toBe(matchId);
    expect(body.seats[0]?.playerSubject).toBe(account.value.playerSubject);
    expect(body.seats[0]?.displayName).toBeNull();

    const moves = matchStore.getMoves(matchId);
    expect(moves.ok).toBe(true);
    if (moves.ok) {
      expect(moves.value).toHaveLength(0);
    }
  });

  it('GET table returns public roster without auth', async () => {
    const { app, matchId } = seedMatch();
    const response = await app.request(`/v1/play/matches/${matchId}/table`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const body = (await response.json()) as { matchId: string; seats: unknown[] };
    expect(body.matchId).toBe(matchId);
    expect(body.seats).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/hole/i);
  });

  it('sit without Authorization does not bind', async () => {
    const { app, matchStore, matchId } = seedMatch();
    const response = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.every((seat) => seat.playerSubject === null)).toBe(true);
  });

  it('rejects client-supplied seatId and state keys', async () => {
    const { app, identityStore, matchId } = seedMatch();
    const issued = identityStore.issueAnonymous();

    const seatIdBody = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issued.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seatId: 's_fake' }),
    });
    expect(seatIdBody.status).toBe(400);
    expect(await seatIdBody.json()).toEqual({ error: 'invalid_body' });

    const stackBody = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issued.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stack: 5000 }),
    });
    expect(stackBody.status).toBe(400);
    expect(await stackBody.json()).toEqual({ error: 'client_supplied_state' });
  });

  it('second sit with same bearer is idempotent', async () => {
    const { app, identityStore, matchId } = seedMatch();
    const issued = identityStore.issueAnonymous();
    const headers = {
      Authorization: `Bearer ${issued.bearer}`,
      'Content-Type': 'application/json',
    };

    const first = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { seatId: string };

    const second = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { seatId: string; seats: unknown[] };
    expect(secondBody.seatId).toBe(firstBody.seatId);
    expect(secondBody.seats.filter((s: { playerSubject?: string | null }) => s.playerSubject === issued.playerSubject)).toHaveLength(1);
  });

  it('full table rejects third sit', async () => {
    const { app, identityStore, matchId } = seedMatch();
    const first = identityStore.issueAnonymous();
    const second = identityStore.issueAnonymous();
    const third = identityStore.issueAnonymous();

    expect(
      (
        await app.request(`/v1/play/matches/${matchId}/sit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${first.bearer}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await app.request(`/v1/play/matches/${matchId}/sit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${second.bearer}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(201);

    const rejected = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${third.bearer}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: 'seat_occupied' });
  });

  it('sit and table responses omit hidden keys', async () => {
    const { app, identityStore, matchId } = seedMatch();
    const issued = identityStore.issueAnonymous();
    const sit = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issued.bearer}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const sitJson = JSON.stringify(await sit.json());
    for (const key of HIDDEN_KEYS) {
      expect(sitJson).not.toContain(`"${key}"`);
    }

    const table = await app.request(`/v1/play/matches/${matchId}/table`);
    const tableJson = JSON.stringify(await table.json());
    for (const key of HIDDEN_KEYS) {
      expect(tableJson).not.toContain(`"${key}"`);
    }
  });
});
