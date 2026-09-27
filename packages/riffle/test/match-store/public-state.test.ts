import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/rules/rng.js';
import { createMatchStore, sanitizeForPublic } from '../../src/match-store/index.js';

const HIDDEN_KEYS = ['hole', 'holes', 'holeCards', 'view', 'hiddenView', 'HandState'] as const;

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
  return keys;
}

describe('match store public state', () => {
  it('omits hole keys from public state but may include server-authored pot and street', () => {
    const store = createMatchStore();
    const created = store.createMatch();
    if (!created.ok) {
      throw new Error('create failed');
    }

    const { matchId } = created.value;
    const seats = store.getPublicState(matchId);
    if (!seats.ok) {
      throw new Error('state failed');
    }

    const seatA = seats.value.seats[0]!.seatId;
    const seatB = seats.value.seats[1]!.seatId;

    const opened = store.openHand(matchId, { rng: createSeededRng(99) });
    expect(opened.ok).toBe(true);

    const viewA = store.getSeatView(matchId, seatA);
    const viewB = store.getSeatView(matchId, seatB);
    if (!viewA.ok || !viewB.ok) {
      throw new Error('seat view failed');
    }

    expect(viewA.value.hole).not.toBeNull();
    expect(viewB.value.hole).not.toBeNull();
    expect(viewA.value.hole).not.toEqual(viewB.value.hole);

    const publicState = store.getPublicState(matchId);
    if (!publicState.ok) {
      throw new Error('public state failed');
    }

    const sanitized = sanitizeForPublic(publicState.value);
    const json = JSON.stringify(sanitized);
    for (const key of HIDDEN_KEYS) {
      expect(json.includes(`"${key}"`)).toBe(false);
    }

    const keys = collectKeys(sanitized);
    for (const key of HIDDEN_KEYS) {
      expect(keys.has(key)).toBe(false);
    }

    expect(publicState.value.pot).toBeDefined();
    expect(publicState.value.street).toBe('preflop');

    expect(viewA.value.hole).not.toEqual(viewB.value.hole);
    expect(JSON.stringify(viewA.value).includes(JSON.stringify(viewB.value.hole!))).toBe(false);
  });
});
