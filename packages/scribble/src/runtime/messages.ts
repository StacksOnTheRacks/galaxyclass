import type { Placement } from '../rules/types.js';
import type { ClientMessage } from './types.js';

/** The server owns the board, racks, scores, and bag. A client that sends any of them is refused. */
const CLIENT_SUPPLIED_STATE_KEYS = [
  'board',
  'rack',
  'racks',
  'score',
  'scores',
  'bag',
  'bagCount',
  'tiles',
  'players',
  'seats',
  'turnOrder',
  'currentSeatId',
  'game',
] as const;

export function parseClientMessage(body: string | null | undefined): ClientMessage | null {
  if (!body || body.length > 16_384) {
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

export function hasClientSuppliedState(message: ClientMessage): boolean {
  return CLIENT_SUPPLIED_STATE_KEYS.some((key) => message[key] !== undefined);
}

/** Shape-checks placements. Legality is the rules engine's job. */
export function parsePlacements(value: unknown): Placement[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) {
    return null;
  }
  const placements: Placement[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    const { tileId, row, col, letter } = entry as Record<string, unknown>;
    if (typeof tileId !== 'string' || !Number.isInteger(row) || !Number.isInteger(col)) {
      return null;
    }
    if (letter !== undefined && typeof letter !== 'string') {
      return null;
    }
    placements.push({ tileId, row: row as number, col: col as number, ...(letter !== undefined ? { letter } : {}) });
  }
  return placements;
}

/** A play forms at most one main word and one cross word per placed tile. */
const MAX_CHECK_WORDS = 8;

/** Shape-checks a word lookup for the score preview. */
export function parseWords(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHECK_WORDS) {
    return null;
  }
  const words: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !/^[A-Za-z]{2,15}$/.test(entry)) {
      return null;
    }
    words.push(entry.toUpperCase());
  }
  return words;
}

export function parseTileIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7 || !value.every((id) => typeof id === 'string')) {
    return null;
  }
  return value as string[];
}
