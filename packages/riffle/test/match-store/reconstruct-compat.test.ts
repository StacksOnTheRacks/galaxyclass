import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/rules/rng.js';
import { createMatchStore } from '../../src/match-store/index.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../../src/server/hands/reconstruct.js';

describe('match store reconstruct compatibility', () => {
  it('written log reconstructs via reconstructHand', () => {
    const store = createMatchStore();
    const created = store.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { matchId } = created.value;
    const opened = store.openHand(matchId, { rng: createSeededRng(123) });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }

    const moves = store.getMoves(matchId);
    if (!moves.ok) {
      throw new Error('moves failed');
    }

    const handOpen = findLatestHandOpen(moves.value);
    expect(handOpen).not.toBeNull();

    const publicState = store.getPublicState(matchId);
    if (!publicState.ok) {
      throw new Error('public failed');
    }

    const holesBySeat = new Map<
      string,
      [import('../../src/rules/types.js').Card, import('../../src/rules/types.js').Card]
    >();
    for (const seat of publicState.value.seats) {
      const view = store.getSeatView(matchId, seat.seatId);
      if (view.ok && view.value.hole) {
        holesBySeat.set(seat.seatId, view.value.hole);
      }
    }

    const reconstructed = reconstructHand({
      handOpen: handOpen!,
      actions: actionsAfterHandOpen(moves.value),
      holesBySeat,
    });

    expect(reconstructed.ok).toBe(true);
    if (reconstructed.ok) {
      expect(reconstructed.value.currentSeatId).toBe(opened.value.currentSeat);
      expect(reconstructed.value.pot).toBeGreaterThan(0);
    }
  });
});
