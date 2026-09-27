import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/rules/rng.js';
import { createMatchStore } from '../../src/match-store/index.js';

describe('match store concurrency', () => {
  it('rejects overlapping mutations with illegal_turn and writes nothing for the loser', async () => {
    const store = createMatchStore();
    const created = store.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { matchId } = created.value;
    const opened = store.openHand(matchId, { rng: createSeededRng(7) });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }

    const movesBefore = store.getMoves(matchId);
    if (!movesBefore.ok) {
      throw new Error('moves failed');
    }

    const hold = store.holdWrite(matchId);
    expect(hold.ok).toBe(true);
    if (!hold.ok) {
      return;
    }

    const loser = store.appendMove(matchId, opened.value.currentSeat, {
      kind: 'action',
      action: { type: 'fold' },
    });
    expect(loser.ok).toBe(false);
    if (loser.ok) {
      return;
    }
    expect(loser.error).toBe('illegal_turn');
    expect(loser.status).toBe(409);

    const movesAfterLoser = store.getMoves(matchId);
    if (!movesAfterLoser.ok) {
      throw new Error('moves failed');
    }
    expect(movesAfterLoser.value).toEqual(movesBefore.value);

    hold.value.release();

    const winner = store.appendMove(matchId, opened.value.currentSeat, {
      kind: 'action',
      action: { type: 'fold' },
    });
    expect(winner.ok).toBe(true);

    const movesAfter = store.getMoves(matchId);
    if (!movesAfter.ok) {
      throw new Error('moves failed');
    }
    expect(movesAfter.value.length).toBe(movesBefore.value.length + 1);
  });
});
