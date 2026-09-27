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
];

function seedSeatedAnonymous() {
  const matchStore = createMatchStore();
  const identityStore = createIdentityStore();
  const created = matchStore.createMatch();
  if (!created.ok) {
    throw new Error('create failed');
  }
  const matchId = created.value.matchId;
  const issued = identityStore.issueAnonymous();
  const sit = matchStore.claimEmptySeat(matchId, issued.playerSubject);
  if (!sit.ok) {
    throw new Error('sit failed');
  }
  const { app } = createTestApp({ stores: { matchStore, identityStore } });
  return { app, matchStore, identityStore, matchId, bearer: issued.bearer, seatId: sit.value.seatId };
}

describe('display-name routes', () => {
  it('anonymous seated bearer saves LuckyAce', async () => {
    const { app, matchStore, matchId, bearer, seatId } = seedSeatedAnonymous();

    const response = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const body = (await response.json()) as {
      seatId: string;
      seats: Array<{ seatId: string; displayName: string | null; playerSubject: string | null }>;
    };
    expect(body.seatId).toBe(seatId);
    expect(body.seats.find((seat) => seat.seatId === seatId)?.displayName).toBe('LuckyAce');

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.find((seat) => seat.seatId === seatId)?.displayName).toBe('LuckyAce');
    expect(state.value.seats.find((seat) => seat.seatId === seatId)?.playerSubject).toMatch(/^anon:/);

    const moves = matchStore.getMoves(matchId);
    expect(moves.ok).toBe(true);
    if (moves.ok) {
      expect(moves.value).toHaveLength(0);
    }

    const serialized = JSON.stringify(body);
    for (const key of HIDDEN_KEYS) {
      expect(serialized.toLowerCase()).not.toContain(key.toLowerCase());
    }
  });

  it('save without Authorization does not write', async () => {
    const { app, matchStore, matchId } = seedSeatedAnonymous();
    const response = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(response.status).toBe(401);

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.every((seat) => seat.displayName === null)).toBe(true);
  });
});
