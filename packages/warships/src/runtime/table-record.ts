import { SEAT_IDS } from '../rules/constants.js';
import { emptyGame, type PlayerBoard } from '../rules/game.js';
import type { SeatId } from '../rules/types.js';
import { META_SK, tablePk } from './keys.js';
import type { StoredGame, TableRecord } from './types.js';

export function emptyStoredGame(): StoredGame {
  return emptyGame();
}

export interface NewTableInput {
  tableId: string;
  createdAt: string;
  tableName?: string;
  createdBy?: string | null;
}

/** The one shape every Warships table starts in: a member's private table, reached by its link. */
export function newTableRecord(input: NewTableInput): TableRecord {
  return {
    tableId: input.tableId,
    version: 1,
    createdAt: input.createdAt,
    maxSeats: 2,
    createdBy: input.createdBy ?? null,
    ...(input.tableName ? { tableName: input.tableName } : {}),
    gameNumber: 0,
    game: emptyStoredGame(),
  };
}

export function tableMetaKey(tableId: string): { PK: string; SK: string } {
  return { PK: tablePk(tableId), SK: META_SK };
}

/** The DynamoDB item for a table's META row, as the runtime store reads it. */
export function tableMetaItem(table: TableRecord): Record<string, unknown> {
  return { ...tableMetaKey(table.tableId), ...table };
}

const STATUSES = ['waiting', 'placing', 'battle', 'finished'] as const;
const END_REASONS = ['fleet_sunk', 'forfeit', 'abandoned'] as const;

function isSeatId(value: unknown): value is SeatId {
  return typeof value === 'string' && (SEAT_IDS as readonly string[]).includes(value);
}

function seatIdOrNull(value: unknown): SeatId | null {
  return isSeatId(value) ? value : null;
}

function seatIds(value: unknown): SeatId[] {
  return Array.isArray(value) ? value.filter(isSeatId) : [];
}

function parseBoards(value: unknown): Partial<Record<SeatId, PlayerBoard>> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const boards: Partial<Record<SeatId, PlayerBoard>> = {};
  for (const [seatId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isSeatId(seatId) || typeof raw !== 'object' || raw === null) {
      continue;
    }
    const board = raw as Partial<PlayerBoard>;
    boards[seatId] = { fleet: Array.isArray(board.fleet) ? board.fleet : null, ready: board.ready === true };
  }
  return boards;
}

/** Reads a stored table item defensively so older or partial records still load. */
export function parseTableItem(item: Record<string, unknown>): TableRecord {
  const game = (typeof item.game === 'object' && item.game !== null ? item.game : {}) as Partial<StoredGame>;
  const empty = emptyStoredGame();
  return {
    tableId: String(item.tableId),
    version: Number(item.version ?? 1),
    createdAt: String(item.createdAt ?? ''),
    maxSeats: 2,
    createdBy: typeof item.createdBy === 'string' ? item.createdBy : null,
    ...(typeof item.tableName === 'string' && item.tableName ? { tableName: item.tableName } : {}),
    gameNumber: Number(item.gameNumber ?? 0),
    game: {
      status: (STATUSES as readonly string[]).includes(game.status as string) ? game.status! : empty.status,
      players: seatIds(game.players),
      boards: parseBoards(game.boards),
      firstSeatId: seatIdOrNull(game.firstSeatId),
      currentSeatId: seatIdOrNull(game.currentSeatId),
      turnNumber: Number(game.turnNumber ?? 0),
      turnOpensAt: typeof game.turnOpensAt === 'number' ? game.turnOpensAt : null,
      history: Array.isArray(game.history) ? game.history : empty.history,
      winnerSeatId: seatIdOrNull(game.winnerSeatId),
      endReason: (END_REASONS as readonly string[]).includes(game.endReason as string) ? game.endReason! : null,
      rematchVotes: seatIds(game.rematchVotes),
      ...(game.roster && typeof game.roster === 'object' ? { roster: game.roster } : {}),
      ...(typeof game.startedAt === 'string' ? { startedAt: game.startedAt } : {}),
      ...(typeof game.endedAt === 'string' ? { endedAt: game.endedAt } : {}),
    },
  };
}
