import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { createTestApp } from '../helpers/test-app.js';

describe('display-name visibility', () => {
  it('GET table and save response expose displayName without auth on GET', async () => {
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

    const save = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issued.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(save.status).toBe(200);
    const saveBody = (await save.json()) as {
      seats: Array<{ displayName: string | null }>;
    };
    expect(saveBody.seats.some((seat) => seat.displayName === 'LuckyAce')).toBe(true);

    const table = await app.request(`/v1/play/matches/${matchId}/table`);
    expect(table.status).toBe(200);
    const tableBody = (await table.json()) as {
      seats: Array<{ displayName: string | null }>;
    };
    expect(tableBody.seats.some((seat) => seat.displayName === 'LuckyAce')).toBe(true);
  });

  it('two seats may share the same valid name', async () => {
    const matchStore = createMatchStore();
    const identityStore = createIdentityStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }
    const matchId = created.value.matchId;
    const anonA = identityStore.issueAnonymous();
    const anonB = identityStore.issueAnonymous();
    matchStore.claimEmptySeat(matchId, anonA.playerSubject);
    matchStore.claimEmptySeat(matchId, anonB.playerSubject);
    const { app } = createTestApp({ stores: { matchStore, identityStore } });

    const saveA = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonA.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    const saveB = await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonB.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });
    expect(saveA.status).toBe(200);
    expect(saveB.status).toBe(200);

    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.filter((seat) => seat.displayName === 'LuckyAce')).toHaveLength(2);
  });

  it('identity session is unchanged after save', async () => {
    const matchStore = createMatchStore();
    const identityStore = createIdentityStore();
    const created = matchStore.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }
    const matchId = created.value.matchId;
    const issued = identityStore.issueAnonymous();
    matchStore.claimEmptySeat(matchId, issued.playerSubject);
    const { app } = createTestApp({ stores: { matchStore, identityStore } });

    await app.request(`/v1/play/matches/${matchId}/display-name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issued.bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'LuckyAce' }),
    });

    const session = await app.request('/v1/identity/session', {
      headers: { Authorization: `Bearer ${issued.bearer}` },
    });
    expect(session.status).toBe(200);
    const body = (await session.json()) as { playerSubject: string };
    expect(body.playerSubject).toBe(issued.playerSubject);
  });
});
