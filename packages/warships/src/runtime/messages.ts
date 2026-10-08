import { CLIENT_SUPPLIED_STATE_KEYS, type ClientMessage } from '../protocol.js';
import { MAX_MESSAGE_BYTES } from '../rules/constants.js';
import type { Coord } from '../rules/types.js';

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

/** The server owns boards, shots, turns, and results. A frame carrying any of them is refused. */
export function hasClientSuppliedState(message: ClientMessage): boolean {
  const frame = message as unknown as Record<string, unknown>;
  return CLIENT_SUPPLIED_STATE_KEYS.some((key) => frame[key] !== undefined);
}

/** Shape-checks a fire target. Whether it is on the board is the rules engine's job. */
export function parseCoord(value: unknown): Coord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const { row, col } = value as Record<string, unknown>;
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  return { row: row as number, col: col as number };
}
