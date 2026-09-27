import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/rules/rng.js';
import { MATCH_STARTING_STACK, createMatchStore } from '../../src/match-store/index.js';

describe('match store client authority', () => {
  it('rejects client-supplied stack on createMatch', () => {
    const store = createMatchStore();
    const result = store.createMatch({ seatCount: 2, stack: 5000 } as { seatCount: number });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('client_supplied_state');
    expect(result.status).toBe(400);
  });

  it('rejects client-supplied pot or deal on openHand and leaves stored state unchanged', () => {
    const store = createMatchStore();
    const created = store.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { matchId } = created.value;
    const before = store.getPublicState(matchId);
    if (!before.ok) {
      throw new Error('state failed');
    }

    const rejected = store.openHand(matchId, {
      rng: createSeededRng(1),
      pot: 999,
    } as { rng: ReturnType<typeof createSeededRng>; pot: number });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) {
      return;
    }
    expect(rejected.error).toBe('client_supplied_state');
    expect(rejected.status).toBe(400);

    const after = store.getPublicState(matchId);
    expect(after).toEqual(before);
    expect(before.value.seats.every((seat) => seat.stack === MATCH_STARTING_STACK)).toBe(true);

    const opened = store.openHand(matchId, { rng: createSeededRng(1) });
    expect(opened.ok).toBe(true);
  });
});
