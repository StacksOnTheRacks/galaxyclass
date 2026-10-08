import { describe, expect, it } from 'vitest';
import { CLIENT_SUPPLIED_STATE_KEYS, type ClientMessage } from '../../src/protocol.js';
import { hasClientSuppliedState, MAX_MESSAGE_BYTES, parseClientMessage, parseDestination } from '../../src/runtime/messages.js';

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
      expect(hasClientSuppliedState({ action: 'roll', seatToken: 't', [key]: 1 } as ClientMessage)).toBe(true);
    }
    const legal: ClientMessage[] = [
      { action: 'roll', seatToken: 't' },
      { action: 'move', seatToken: 't', to: { kind: 'room', room: 'parlor' } },
      { action: 'suggest', seatToken: 't', suspect: 'rook', weapon: 'vial' },
      { action: 'show_card', seatToken: 't', card: 'vial' },
      { action: 'accuse', seatToken: 't', suspect: 'rook', weapon: 'vial', room: 'parlor' },
      { action: 'choose_suspect', seatToken: 't', suspect: 'rook' },
      { action: 'sit', accessToken: 'x', seatId: '4' },
      { action: 'create_table', accessToken: 'x', tableName: 'Midnight case' },
    ];
    for (const message of legal) expect(hasClientSuppliedState(message)).toBe(false);
  });
});

describe('parseDestination', () => {
  it('accepts a room by id or a hallway square on the board, leaving reach to the rules', () => {
    expect(parseDestination({ kind: 'room', room: 'greenhouse' })).toEqual({ kind: 'room', room: 'greenhouse' });
    expect(parseDestination({ kind: 'hall', x: 7, y: 23, extra: true })).toEqual({ kind: 'hall', x: 7, y: 23 });
    expect(parseDestination({ kind: 'hall', x: 12, y: 12 })).toEqual({ kind: 'hall', x: 12, y: 12 });
  });

  it('refuses anything else', () => {
    for (const value of [
      null,
      'parlor',
      ['hall', 1, 2],
      { kind: 'room', room: 'kitchen' },
      { kind: 'hall', x: 24, y: 0 },
      { kind: 'hall', x: -1, y: 0 },
      { kind: 'hall', x: 1.5, y: 0 },
      { kind: 'hall', x: '1', y: 0 },
      { kind: 'door', x: 1, y: 0 },
    ]) {
      expect(parseDestination(value)).toBeNull();
    }
  });
});
