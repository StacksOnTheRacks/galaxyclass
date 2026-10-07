import type { EndReason, GameStatus, LastTurn, TurnRecord } from '../rules/game.js';
import type { BoardTile, PlacementError, Tile } from '../rules/types.js';
import type { ThemeId } from '../themes/ids.js';

export type TableVisibility = 'public' | 'private';

export interface RosterEntry {
  displayName: string;
  avatarId: number;
}

/** Shared game state kept on the table record. Racks and scores live on seats. */
export interface StoredGame {
  status: GameStatus;
  board: BoardTile[];
  /** Server-only: never serialized to a client. */
  bag: Tile[];
  turnOrder: string[];
  currentSeatId: string | null;
  scorelessTurns: number;
  turnNumber: number;
  lastTurn: LastTurn | null;
  endReason: EndReason | null;
  finalAdjustments: Record<string, number> | null;
  wentOutSeatId: string | null;
  /** Absent on records written before turn history was kept. */
  history?: TurnRecord[];
  finalScores?: Record<string, number> | null;
  /** Who played from each seat this game, so the report can still name a player who has left. */
  roster?: Record<string, RosterEntry>;
  /** ISO times the game started and ended. */
  startedAt?: string;
  endedAt?: string;
}

/** The end-of-game report data. Every field is public: it only repeats what the table already saw. */
export interface GameRecap {
  history: TurnRecord[];
  finalScores: Record<string, number> | null;
  roster: Record<string, RosterEntry>;
  startedAt: string | null;
  endedAt: string | null;
}

export interface TableRecord {
  tableId: string;
  version: number;
  createdAt: string;
  maxSeats: number;
  themeId: ThemeId;
  /**
   * Seeded tables are public and listed. A later feature lets a signed-in player create a
   * private, unlisted table; join, sit, and leave do not branch on these fields.
   */
  visibility: TableVisibility;
  listed: boolean;
  createdBy: string | null;
  tableName?: string;
  /** Counts games started at this table, so clients can tell a new game's turn 1 from the last one's. */
  gameNumber: number;
  game: StoredGame;
}

export interface SeatRecord {
  seatId: string;
  displayName: string;
  avatarId: number;
  /** Cognito sub for signed-in players. Never sent to clients. */
  playerSub?: string;
  seatTokenHash: string;
  /** Absent while the player is away; the seat stays theirs until they resume, leave, or are removed. */
  connectionId?: string;
  /** ISO time the seat's last connection closed. Cleared on resume. */
  awaySince?: string;
  rack: Tile[];
  score: number;
}

export interface ConnectionRecord {
  connectionId: string;
  tableId?: string;
  seatId?: string;
}

export interface ClientMessage {
  action: string;
  [key: string]: unknown;
}

export interface PublicSeat {
  seatId: string;
  occupied: boolean;
  displayName: string | null;
  avatarId: number | null;
  signedIn: boolean;
  score: number;
  rackCount: number;
  inGame: boolean;
  isLocal: boolean;
  /** False while the seated player has no open connection. */
  connected: boolean;
  awaySince: string | null;
}

export interface TableSnapshot {
  type: 'table_snapshot';
  tableId: string;
  version: number;
  tableName: string | null;
  themeId: ThemeId;
  maxSeats: number;
  gameNumber: number;
  status: GameStatus;
  seats: PublicSeat[];
  board: Array<{ row: number; col: number; letter: string; blank: boolean }>;
  bagCount: number;
  currentSeatId: string | null;
  turnNumber: number;
  scorelessTurns: number;
  lastTurn: LastTurn | null;
  endReason: EndReason | null;
  finalAdjustments: Record<string, number> | null;
  wentOutSeatId: string | null;
  /** Present only once the game has ended. */
  recap?: GameRecap;
  /** Present only in the snapshot sent to that seat's own connection. */
  you: { seatId: string; rack: Tile[] } | null;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  reason?: PlacementError;
  words?: string[];
}

export type OutboundMessage =
  | TableSnapshot
  | ErrorMessage
  | { type: 'sat'; seatId: string; seatToken: string }
  /** `taken_over` goes to a connection whose seat was resumed from another window or device. */
  | { type: 'left'; seatId: string; reason?: 'taken_over' }
  | { type: 'word_check'; words: Array<{ text: string; valid: boolean }> }
  | { type: 'pong' }
  | { type: 'my_tables'; you: { gamerTag: string | null; avatarId: number | null }; tables: TableSummary[] }
  | { type: 'table_created'; table: TableSummary }
  | { type: 'table_forgotten'; tableId: string }
  | { type: 'table_deleted'; tableId: string };

export type MembershipRole = 'owner' | 'member';

/** A member's link to a table: created it, or opened its invite link while signed in. */
export interface MembershipRecord {
  playerSub: string;
  tableId: string;
  role: MembershipRole;
  joinedAt: string;
}

/** One card in a member's table list. Carries no subs or seat tokens. */
export interface TableSummary {
  tableId: string;
  tableName: string | null;
  role: MembershipRole;
  status: GameStatus;
  gameNumber: number;
  maxSeats: number;
  seats: Array<{ seatId: string; displayName: string; avatarId: number; away: boolean; isYou: boolean }>;
  createdAt: string;
  joinedAt: string;
}

export interface WebSocketEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
  };
  body?: string | null;
}

export type PostToConnection = (connectionId: string, message: OutboundMessage) => Promise<void>;
