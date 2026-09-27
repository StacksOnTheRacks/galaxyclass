import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { isHandOpenPayload } from '../../src/server/hands/move-types.js';
import { createTestApp } from '../helpers/test-app.js';

describe('mixed occupancy', () => {
  it('account and anonymous seats share a match without opening a hand', async () => {
    const matchStore = createMatchStore();
    const identityStore = createIdentityStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }
    const { app } = createTestApp({ stores: { matchStore, identityStore } });
    const { matchId } = created.value;

    const account = await identityStore.signUp('acct@example.com', 'password123');
    if (!account.ok) {
      throw new Error('sign up failed');
    }
    const anon = identityStore.issueAnonymous();

    const accountSit = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.value.bearer}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(accountSit.status).toBe(201);

    const anonSit = await app.request(`/v1/play/matches/${matchId}/sit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anon.bearer}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(anonSit.status).toBe(201);

    const table = await app.request(`/v1/play/matches/${matchId}/table`);
    const body = (await table.json()) as {
      seats: Array<{ playerSubject: string | null }>;
    };
    const subjects = body.seats
      .map((seat) => seat.playerSubject)
      .filter((subject): subject is string => subject !== null);
    expect(subjects).toHaveLength(2);
    expect(subjects.some((subject) => subject.startsWith('acct_'))).toBe(true);
    expect(subjects.some((subject) => subject.startsWith('anon:'))).toBe(true);

    const moves = matchStore.getMoves(matchId);
    if (!moves.ok) {
      throw new Error('moves failed');
    }
    expect(moves.value.some((move) => isHandOpenPayload(move.payload))).toBe(false);
  });
});
