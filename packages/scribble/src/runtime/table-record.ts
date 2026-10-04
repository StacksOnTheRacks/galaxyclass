import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from '../themes/ids.js';
import { MAX_PLAYERS } from '../rules/game.js';
import type { StoredGame, TableRecord, TableVisibility } from './types.js';

export function emptyStoredGame(): StoredGame {
  return {
    status: 'waiting',
    board: [],
    bag: [],
    turnOrder: [],
    currentSeatId: null,
    scorelessTurns: 0,
    turnNumber: 0,
    lastTurn: null,
    endReason: null,
    finalAdjustments: null,
    wentOutSeatId: null,
  };
}

export interface NewTableInput {
  tableId: string;
  createdAt: string;
  tableName?: string;
  themeId?: ThemeId;
  visibility?: TableVisibility;
  createdBy?: string | null;
}

/**
 * The one shape every Scribble table starts in. Seeded tables are public and listed;
 * a private invite-only table is the same record with `visibility: 'private'`, `listed: false`,
 * and `createdBy` set to the creator's sub.
 */
export function newTableRecord(input: NewTableInput): TableRecord {
  const visibility = input.visibility ?? 'public';
  return {
    tableId: input.tableId,
    version: 1,
    createdAt: input.createdAt,
    maxSeats: MAX_PLAYERS,
    themeId: input.themeId ?? DEFAULT_THEME_ID,
    visibility,
    listed: visibility === 'public',
    createdBy: input.createdBy ?? null,
    ...(input.tableName ? { tableName: input.tableName } : {}),
    game: emptyStoredGame(),
  };
}

/** Reads a stored table item defensively so older or partial records still load. */
export function parseTableItem(item: Record<string, unknown>): TableRecord {
  const game = (item.game ?? {}) as Partial<StoredGame>;
  const empty = emptyStoredGame();
  return {
    tableId: String(item.tableId),
    version: Number(item.version ?? 1),
    createdAt: String(item.createdAt ?? ''),
    maxSeats: Number(item.maxSeats ?? MAX_PLAYERS),
    themeId: isThemeId(item.themeId) ? item.themeId : DEFAULT_THEME_ID,
    visibility: item.visibility === 'private' ? 'private' : 'public',
    listed: item.listed !== false,
    createdBy: typeof item.createdBy === 'string' ? item.createdBy : null,
    ...(typeof item.tableName === 'string' && item.tableName ? { tableName: item.tableName } : {}),
    game: {
      status: game.status === 'playing' || game.status === 'ended' ? game.status : 'waiting',
      board: Array.isArray(game.board) ? game.board : empty.board,
      bag: Array.isArray(game.bag) ? game.bag : empty.bag,
      turnOrder: Array.isArray(game.turnOrder) ? game.turnOrder.map(String) : empty.turnOrder,
      currentSeatId: typeof game.currentSeatId === 'string' ? game.currentSeatId : null,
      scorelessTurns: Number(game.scorelessTurns ?? 0),
      turnNumber: Number(game.turnNumber ?? 0),
      lastTurn: game.lastTurn ?? null,
      endReason: game.endReason ?? null,
      finalAdjustments: game.finalAdjustments ?? null,
      wentOutSeatId: typeof game.wentOutSeatId === 'string' ? game.wentOutSeatId : null,
    },
  };
}
