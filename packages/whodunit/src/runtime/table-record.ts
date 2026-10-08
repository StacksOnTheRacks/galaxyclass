import { isCardId, isRoomId, isSeatId, isSuspectId, isWeaponId } from '../rules/cards.js';
import { SUSPECT_IDS, WEAPON_IDS } from '../rules/constants.js';
import { emptyGame, type GameState, type SeatPick, type TurnState } from '../rules/game.js';
import type { CardId, RoomId, SeatId, SuspectId, TokenPosition, WeaponId } from '../rules/types.js';
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

/** The one shape every Whodunit? table starts in: a member's private table, reached by its link. */
export function newTableRecord(input: NewTableInput): TableRecord {
  return {
    tableId: input.tableId,
    version: 1,
    createdAt: input.createdAt,
    maxSeats: 6,
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

const STATUSES = ['setup', 'playing', 'finished'] as const;
const END_REASONS = ['solved', 'unsolved', 'abandoned'] as const;
const PHASES = ['start', 'moving', 'moved', 'refuting', 'suggested'] as const;

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function seatIdOrNull(value: unknown): SeatId | null {
  return isSeatId(value) ? value : null;
}

function seatIds(value: unknown): SeatId[] {
  return Array.isArray(value) ? value.filter(isSeatId) : [];
}

function cards(value: unknown): CardId[] {
  return Array.isArray(value) ? value.filter(isCardId) : [];
}

function parsePosition(value: unknown): TokenPosition | null {
  if (!isObject(value)) return null;
  if (value.kind === 'room') return isRoomId(value.room) ? { kind: 'room', room: value.room } : null;
  if (value.kind === 'hall' && Number.isInteger(value.x) && Number.isInteger(value.y)) {
    return { kind: 'hall', x: value.x as number, y: value.y as number };
  }
  return null;
}

function parsePicks(value: unknown): Partial<Record<SeatId, SeatPick>> {
  const picks: Partial<Record<SeatId, SeatPick>> = {};
  if (!isObject(value)) return picks;
  for (const [seatId, raw] of Object.entries(value)) {
    if (isSeatId(seatId) && isObject(raw)) {
      picks[seatId] = { suspect: isSuspectId(raw.suspect) ? raw.suspect : null, ready: raw.ready === true };
    }
  }
  return picks;
}

function parseHands(value: unknown): Partial<Record<SeatId, CardId[]>> {
  const hands: Partial<Record<SeatId, CardId[]>> = {};
  if (!isObject(value)) return hands;
  for (const [seatId, raw] of Object.entries(value)) {
    if (isSeatId(seatId)) hands[seatId] = cards(raw);
  }
  return hands;
}

function parsePositions(value: unknown, fallback: Record<SuspectId, TokenPosition>): Record<SuspectId, TokenPosition> {
  const raw = isObject(value) ? value : {};
  return Object.fromEntries(SUSPECT_IDS.map((id) => [id, parsePosition(raw[id]) ?? fallback[id]])) as Record<
    SuspectId,
    TokenPosition
  >;
}

function parseWeapons(value: unknown): Record<WeaponId, RoomId> | null {
  if (!isObject(value) || !WEAPON_IDS.every((id) => isRoomId(value[id]))) return null;
  return Object.fromEntries(WEAPON_IDS.map((id) => [id, value[id]])) as Record<WeaponId, RoomId>;
}

function parseTurn(value: unknown): TurnState | null {
  if (!isObject(value) || !(PHASES as readonly unknown[]).includes(value.phase)) return null;
  const dice = Array.isArray(value.dice) && value.dice.length === 2 ? (value.dice as [number, number]) : null;
  const suggestion = isObject(value.suggestion) &&
    isSuspectId(value.suggestion.suspect) &&
    isWeaponId(value.suggestion.weapon) &&
    isRoomId(value.suggestion.room)
    ? { suspect: value.suggestion.suspect, weapon: value.suggestion.weapon, room: value.suggestion.room }
    : null;
  return {
    phase: value.phase as TurnState['phase'],
    dice,
    startRoom: isRoomId(value.startRoom) ? value.startRoom : null,
    enteredRoom: isRoomId(value.enteredRoom) ? value.enteredRoom : null,
    suggestion,
    refuterSeatId: seatIdOrNull(value.refuterSeatId),
    passed: seatIds(value.passed),
  };
}

function parseGame(value: unknown): StoredGame {
  const game = isObject(value) ? value : {};
  const empty = emptyStoredGame();
  const solution = isObject(game.solution) &&
    isSuspectId(game.solution.suspect) &&
    isWeaponId(game.solution.weapon) &&
    isRoomId(game.solution.room)
    ? { suspect: game.solution.suspect, weapon: game.solution.weapon, room: game.solution.room }
    : null;
  const parsed: GameState = {
    status: (STATUSES as readonly unknown[]).includes(game.status) ? (game.status as GameState['status']) : empty.status,
    picks: parsePicks(game.picks),
    players: seatIds(game.players),
    solution,
    hands: parseHands(game.hands),
    positions: parsePositions(game.positions, empty.positions),
    weapons: parseWeapons(game.weapons),
    currentSeatId: seatIdOrNull(game.currentSeatId),
    turnNumber: Number(game.turnNumber ?? 0),
    turn: parseTurn(game.turn),
    pulledIn: seatIds(game.pulledIn),
    eliminated: seatIds(game.eliminated),
    departed: seatIds(game.departed),
    revealedCards: cards(game.revealedCards),
    log: Array.isArray(game.log) ? (game.log as GameState['log']) : empty.log,
    seq: Number(game.seq ?? 0),
    nextActionAt: typeof game.nextActionAt === 'number' ? game.nextActionAt : null,
    winnerSeatId: seatIdOrNull(game.winnerSeatId),
    endReason: (END_REASONS as readonly unknown[]).includes(game.endReason) ? (game.endReason as GameState['endReason']) : null,
  };
  return {
    ...parsed,
    ...(isObject(game.roster) ? { roster: game.roster as StoredGame['roster'] } : {}),
    ...(typeof game.startedAt === 'string' ? { startedAt: game.startedAt } : {}),
    ...(typeof game.endedAt === 'string' ? { endedAt: game.endedAt } : {}),
  };
}

/** Reads a stored table item defensively so older or partial records still load. */
export function parseTableItem(item: Record<string, unknown>): TableRecord {
  return {
    tableId: String(item.tableId),
    version: Number(item.version ?? 1),
    createdAt: String(item.createdAt ?? ''),
    maxSeats: 6,
    createdBy: typeof item.createdBy === 'string' ? item.createdBy : null,
    ...(typeof item.tableName === 'string' && item.tableName ? { tableName: item.tableName } : {}),
    gameNumber: Number(item.gameNumber ?? 0),
    game: parseGame(item.game),
  };
}
