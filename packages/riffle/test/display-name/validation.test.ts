import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { DISPLAY_NAME_ERROR_MESSAGE } from '../../src/shared/display-name.js';
import { createTestApp } from '../helpers/test-app.js';

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
  return { app, matchStore, matchId, bearer: issued.bearer, seatId: sit.value.seatId };
}

async function saveName(
  app: ReturnType<typeof createTestApp>['app'],
  matchId: string,
  bearer: string,
  displayName: string,
) {
  return app.request(`/v1/play/matches/${matchId}/display-name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName }),
  });
}

describe('display-name validation', () => {
  it('trims and persists Ace from padded input', async () => {
    const { app, matchStore, matchId, bearer, seatId } = seedSeatedAnonymous();
    const response = await saveName(app, matchId, bearer, ' Ace ');
    expect(response.status).toBe(200);
    const state = matchStore.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats.find((seat) => seat.seatId === seatId)?.displayName).toBe('Ace');
  });

  it('rejects empty, too short, and too long names', async () => {
    const { app, matchStore, matchId, bearer, seatId } = seedSeatedAnonymous();
    const before = matchStore.getPublicState(matchId);
    if (!before.ok) {
      throw new Error('state failed');
    }
    expect(before.value.seats.find((seat) => seat.seatId === seatId)?.displayName).toBeNull();

    for (const invalid of ['', ' Ab ', 'a'.repeat(25)]) {
      const response = await saveName(app, matchId, bearer, invalid);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message?: string };
      expect(body.error).toBe('invalid_display_name');
      expect(body.message).toBe(DISPLAY_NAME_ERROR_MESSAGE);
    }

    const after = matchStore.getPublicState(matchId);
    if (!after.ok) {
      throw new Error('state failed');
    }
    expect(after.value.seats.find((seat) => seat.seatId === seatId)?.displayName).toBeNull();
  });
});
