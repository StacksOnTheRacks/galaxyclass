import { CLIENT_SUPPLIED_STATE_KEYS, type ClientMessage } from '../protocol.js';
import { BOARD_COLS, BOARD_ROWS } from '../rules/board.js';
import { isRoomId } from '../rules/cards.js';
import { MAX_MESSAGE_BYTES } from '../rules/constants.js';
import type { Destination } from '../rules/types.js';

export { MAX_MESSAGE_BYTES };

/** Parses one inbound frame. Oversized, non-JSON, and action-less frames are all `null`. */
export function parseClientMessage(body: string | null | undefined): ClientMessage | null {
  if (!body || Buffer.byteLength(body, 'utf8') > MAX_MESSAGE_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const action = (parsed as { action?: unknown }).action;
    return typeof action === 'string' ? (parsed as ClientMessage) : null;
  } catch {
    return null;
  }
}

/** The server owns the case file, hands, tokens, dice, turns, and results. A frame carrying any of them is refused. */
export function hasClientSuppliedState(message: ClientMessage): boolean {
  const frame = message as unknown as Record<string, unknown>;
  return CLIENT_SUPPLIED_STATE_KEYS.some((key) => frame[key] !== undefined);
}

/** Shape-checks a move target. Whether it is reachable is the rules engine's job. */
export function parseDestination(value: unknown): Destination | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const { kind, room, x, y } = value as Record<string, unknown>;
  if (kind === 'room') {
    return isRoomId(room) ? { kind: 'room', room } : null;
  }
  if (kind === 'hall' && Number.isInteger(x) && Number.isInteger(y)) {
    const col = x as number;
    const row = y as number;
    return col >= 0 && row >= 0 && col < BOARD_COLS && row < BOARD_ROWS ? { kind: 'hall', x: col, y: row } : null;
  }
  return null;
}
