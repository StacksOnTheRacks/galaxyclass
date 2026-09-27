import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/rules/rng.js';
import { MATCH_STARTING_STACK, createMatchStore } from '../../src/match-store/index.js';
import { isHandOpenPayload } from '../../src/server/hands/move-types.js';
import { createTestApp } from '../helpers/test-app.js';

describe('match store', () => {
  it('creates a match with default two empty seats', () => {
    const store = createMatchStore();
    const created = store.createMatch();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const state = store.getPublicState(created.value.matchId);
    expect(state.ok).toBe(true);
    if (!state.ok) {
      return;
    }

    expect(state.value.seats).toHaveLength(2);
    for (const seat of state.value.seats) {
      expect(seat.playerSubject).toBeNull();
      expect(seat.displayName).toBeNull();
      expect(seat.stack).toBe(MATCH_STARTING_STACK);
    }
    expect(state.value.currentSeat).toBeNull();
  });

  it('stores occupant fields without sit or identity issue', () => {
    const store = createMatchStore();
    const created = store.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { matchId } = created.value;
    const seatId = store.getPublicState(matchId);
    if (!seatId.ok) {
      throw new Error('state failed');
    }
    const firstSeat = seatId.value.seats[0]!.seatId;

    const bound = store.setSeatOccupant(matchId, firstSeat, 'acct_test');
    expect(bound.ok).toBe(true);

    const state = store.getPublicState(matchId);
    if (!state.ok) {
      throw new Error('state failed');
    }
    expect(state.value.seats[0]?.playerSubject).toBe('acct_test');
  });

  it('appends moves without rewriting prior entries', () => {
    const store = createMatchStore();
    const created = store.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { matchId } = created.value;
    const open = store.openHand(matchId, { rng: createSeededRng(42) });
    expect(open.ok).toBe(true);

    const movesBefore = store.getMoves(matchId);
    if (!movesBefore.ok) {
      throw new Error('moves failed');
    }
    const first = movesBefore.value[0]!;

    const seatId = open.ok ? open.value.currentSeat : '';
    const appended = store.appendMove(matchId, seatId, {
      kind: 'action',
      action: { type: 'fold' },
    });
    expect(appended.ok).toBe(true);

    const movesAfter = store.getMoves(matchId);
    if (!movesAfter.ok) {
      throw new Error('moves failed');
    }
    expect(movesAfter.value).toHaveLength(2);
    expect(movesAfter.value[0]).toEqual(first);
    expect(isHandOpenPayload(movesAfter.value[0]?.payload)).toBe(true);
  });

  it('injects through createTestApp stores bag', () => {
    const matchStore = createMatchStore();
    const { stores } = createTestApp({ stores: { matchStore } });
    expect(stores.matchStore).toBe(matchStore);

    const created = stores.matchStore.createMatch();
    expect(created.ok).toBe(true);
  });
});
