import { describe, expect, it } from 'vitest';
import { CLIENT_SUPPLIED_STATE_KEYS, type ClientMessage } from '../../src/protocol.js';
import { hasClientSuppliedState, MAX_MESSAGE_BYTES, parseClientMessage, parseCoord } from '../../src/runtime/messages.js';

describe('parseClientMessage', () => {
  it('reads a JSON object with an action', () => {
    expect(parseClientMessage('{"action":"ping"}')).toEqual({ action: 'ping' });
  });

  it('refuses empty, non-JSON, non-object, and action-less frames', () => {
    for (const body of [null, undefined, '', 'nope', '[1]', '"ping"', '{"type":"ping"}', '{"action":3}']) {
      expect(parseClientMessage(body)).toBeNull();
    }
  });

  it('caps a frame by its UTF-8 size before parsing', () => {
    const pad = (n: number, char = 'x') => JSON.stringify({ action: 'ping', pad: char.repeat(n) });
    const overhead = pad(0).length;
    expect(parseClientMessage(pad(MAX_MESSAGE_BYTES - overhead))).not.toBeNull();
    expect(parseClientMessage(pad(MAX_MESSAGE_BYTES - overhead + 1))).toBeNull();
    expect(parseClientMessage(pad(Math.ceil(MAX_MESSAGE_BYTES / 3), '€'))).toBeNull();
  });
});

describe('hasClientSuppliedState', () => {
  it('flags every server-owned key, and nothing a legal action carries', () => {
    for (const key of CLIENT_SUPPLIED_STATE_KEYS) {
      expect(hasClientSuppliedState({ action: 'fire', seatToken: 't', target: { row: 0, col: 0 }, [key]: 1 } as ClientMessage)).toBe(true);
    }
    expect(hasClientSuppliedState({ action: 'place_fleet', seatToken: 't', fleet: [] })).toBe(false);
    expect(hasClientSuppliedState({ action: 'fire', seatToken: 't', target: { row: 2, col: 6 } })).toBe(false);
  });
});

describe('parseCoord', () => {
  it('accepts integer row and col, leaving bounds to the rules', () => {
    expect(parseCoord({ row: 2, col: 6 })).toEqual({ row: 2, col: 6 });
    expect(parseCoord({ row: 12, col: -1, extra: true })).toEqual({ row: 12, col: -1 });
  });

  it('refuses anything else', () => {
    for (const value of [null, 'C7', [2, 6], { row: '2', col: 6 }, { row: 2.5, col: 6 }, { row: 2 }]) {
      expect(parseCoord(value)).toBeNull();
    }
  });
});
