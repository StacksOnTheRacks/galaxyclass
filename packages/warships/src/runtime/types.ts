import type { MembershipRole, RosterEntry, ServerMessage } from '../protocol.js';
import type { GameState } from '../rules/game.js';
import type { SeatId } from '../rules/types.js';

export type { MembershipRole, RosterEntry };

/** Game state kept on the table's META item, plus report bookkeeping the runtime stamps on commit. */
export interface StoredGame extends GameState {
  /** Who played from each seat this game, so the report can still name a captain who has left. */
  roster?: Partial<Record<SeatId, RosterEntry>>;
  /** ISO times this game started battle and finished. */
  startedAt?: string;
  endedAt?: string;
}

/** Every Warships table is a member's private table reached by its link. */
export interface TableRecord {
  tableId: string;
  version: number;
  createdAt: string;
  maxSeats: 2;
  createdBy: string | null;
  tableName?: string;
  /** Counts games started at this table, so clients can tell a rematch's turn 1 from the last game's. */
  gameNumber: number;
  /** Server-only. Contains both fleets; only `buildSeatScopedSnapshot` may read it for the wire. */
  game: StoredGame;
}

export interface SeatRecord {
  seatId: SeatId;
  displayName: string;
  avatarId: number;
  /** Cognito sub. Never sent to clients. */
  playerSub?: string;
  seatTokenHash: string;
  /** Absent while the captain is away; the seat stays theirs until they resume, leave, or are declared abandoned. */
  connectionId?: string;
  /** ISO time the seat's last connection closed. Cleared on resume. */
  awaySince?: string;
}

export interface ConnectionRecord {
  connectionId: string;
  tableId?: string;
  seatId?: SeatId;
  /** Cognito sub verified by `join_table`. A seat token only resumes for the member it was issued to. Never sent to clients. */
  playerSub?: string;
}

/** A member's link to a table: created it, or opened its invite link while signed in. */
export interface MembershipRecord {
  playerSub: string;
  tableId: string;
  role: MembershipRole;
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

export type PostToConnection = (connectionId: string, message: ServerMessage) => Promise<void>;
