/**
 * The Warships wire contract, shared by the runtime and the client. Server records live in
 * `runtime/types.ts` and never cross the wire; the client imports only this module and `rules/`.
 */
import type {
  Coord,
  EndReason,
  Fleet,
  FleetError,
  GameStatus,
  SeatId,
  ShipPlacement,
  ShotMark,
  ShotRecord,
  SunkShip,
} from './rules/types.js';

export type { Coord, EndReason, Fleet, FleetError, GameStatus, SeatId, ShipPlacement, ShotMark, ShotRecord, SunkShip };

// ---------------------------------------------------------------------------------------------
// Client → server. Every frame is JSON `{ action, ... }` on the `$default` route.
// ---------------------------------------------------------------------------------------------

/** Member actions prove identity with a Cognito access token; they need no table. */
export type MemberAction =
  | { action: 'list_my_tables'; accessToken: string }
  | { action: 'create_table'; accessToken: string; tableName?: string }
  | { action: 'forget_table'; accessToken: string; tableId: string }
  | { action: 'delete_table'; accessToken: string; tableId: string };

/** Binds this connection to a table (and adds it to the member's list). */
export type JoinAction = { action: 'join_table'; accessToken: string; tableId: string };

/** Seat actions need a joined connection. `sit` proves identity; the rest carry the seat token from `sat`. */
export type SeatAction =
  | { action: 'sit'; accessToken: string; seatId?: SeatId }
  | { action: 'resume'; seatToken: string }
  | { action: 'leave'; seatToken: string }
  /** Placing only. The whole fleet at once; ready-up is implied. */
  | { action: 'place_fleet'; seatToken: string; fleet: ShipPlacement[] }
  /** Placing only, before the other captain is also ready. Keeps the fleet, clears ready. */
  | { action: 'unready'; seatToken: string }
  /** Battle only, on your turn, once `turnOpensAt` has passed. */
  | { action: 'fire'; seatToken: string; target: Coord }
  /** Placing or battle: concede. The other captain wins with `endReason: 'forfeit'`. */
  | { action: 'forfeit'; seatToken: string }
  /** Finished only. When both seated captains have voted, a new game starts placing. */
  | { action: 'rematch'; seatToken: string }
  /** Placing or battle: the other captain has been away past AWAY_ABANDON_AFTER_MS. */
  | { action: 'claim_abandoned'; seatToken: string };

export type ClientMessage = { action: 'ping' } | MemberAction | JoinAction | SeatAction;
export type ClientActionName = ClientMessage['action'];

export const CLIENT_ACTIONS = [
  'ping',
  'list_my_tables',
  'create_table',
  'forget_table',
  'delete_table',
  'join_table',
  'sit',
  'resume',
  'leave',
  'place_fleet',
  'unready',
  'fire',
  'forfeit',
  'rematch',
  'claim_abandoned',
] as const satisfies readonly ClientActionName[];

/** The server owns boards, fleets, turns, and results. A frame carrying any of these keys is refused. */
export const CLIENT_SUPPLIED_STATE_KEYS = [
  'game',
  'boards',
  'board',
  'shots',
  'history',
  'result',
  'hits',
  'sunk',
  'seats',
  'currentSeatId',
  'turnNumber',
  'winnerSeatId',
  'status',
] as const;

// ---------------------------------------------------------------------------------------------
// Server → client.
// ---------------------------------------------------------------------------------------------

export const ERROR_CODES = [
  'unsupported_action',
  'client_supplied_state',
  'sign_in_required',
  'invalid_access_token',
  'identity_unavailable',
  'table_not_found',
  'not_table_member',
  'table_limit',
  'not_table_host',
  'version_conflict',
  'invalid_seat',
  'seat_occupied',
  'already_seated',
  'table_full',
  'table_locked',
  'invalid_seat_token',
  /** `resume` with a token issued to a different member than the one who joined on this connection. */
  'seat_not_yours',
  'not_seated',
  'invalid_fleet',
  'not_placing',
  'not_in_battle',
  'not_your_turn',
  'turn_not_open',
  'invalid_target',
  'already_fired',
  'not_finished',
  'no_opponent',
  'opponent_not_away',
  'away_too_recent',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  /** Set with `invalid_fleet`. */
  reason?: FleetError;
}

/** One of the two seats, as everyone joined to the table sees it. Never carries subs or tokens. */
export interface PublicSeat {
  seatId: SeatId;
  occupied: boolean;
  displayName: string | null;
  avatarId: number | null;
  /** This seat is the viewer's own. */
  isLocal: boolean;
  /** False while the seated captain has no open connection. */
  connected: boolean;
  awaySince: string | null;
  /** Fleet locked in for this game (placing), or still in play (battle/finished). */
  ready: boolean;
  /** Ships not yet sunk; null outside battle and finished. */
  shipsAfloat: number | null;
}

/** The viewer's own ocean: their fleet and every shot the opponent has fired at it. */
export interface OwnBoardView {
  seatId: SeatId;
  /** Null until the viewer has placed (`place_fleet`) this game. */
  fleet: Fleet | null;
  ready: boolean;
  incoming: ShotMark[];
}

/**
 * The opponent's ocean as the viewer may see it: the viewer's own shots, and the ships they have sunk.
 * Unsunk ship positions are never included before the game is finished.
 */
export interface TargetBoardView {
  seatId: SeatId;
  shots: ShotMark[];
  sunk: SunkShip[];
  /** The opponent's whole fleet, only once status is `finished`. */
  revealed: Fleet | null;
}

export interface RosterEntry {
  displayName: string;
  avatarId: number;
}

/** The after-action report, present only when finished. Every field repeats what both captains already saw. */
export interface GameRecap {
  shots: ShotRecord[];
  fleets: Partial<Record<SeatId, Fleet>>;
  roster: Partial<Record<SeatId, RosterEntry>>;
  startedAt: string | null;
  endedAt: string | null;
}

/** Seat-scoped: each connection gets its own. A connection without a seat gets `you` and `target` null. */
export interface TableSnapshot {
  type: 'table_snapshot';
  tableId: string;
  version: number;
  tableName: string | null;
  gameNumber: number;
  status: GameStatus;
  seats: PublicSeat[];
  /** The captain whose turn it is in battle. */
  currentSeatId: SeatId | null;
  turnNumber: number;
  /** Server epoch ms the current turn accepts a `fire`; null outside battle. */
  turnOpensAt: number | null;
  /** Server epoch ms this snapshot was built; feeds the client's clock-offset estimate. */
  serverTs: number;
  lastShot: ShotRecord | null;
  winnerSeatId: SeatId | null;
  endReason: EndReason | null;
  /** Seats that have asked for a rematch this finished game. */
  rematchVotes: SeatId[];
  you: OwnBoardView | null;
  target: TargetBoardView | null;
  recap?: GameRecap;
}

/**
 * Broadcast to every connection at the table, immediately before the snapshots that include it, so
 * both captains can play the same sonar animation. Carries nothing that is not already public.
 */
export interface ShotEvent extends ShotRecord {
  type: 'shot';
  tableId: string;
  /** Who fires next; null when the shot ended the game. */
  nextSeatId: SeatId | null;
  /** Server epoch ms the next turn opens; null when the game is over. */
  turnOpensAt: number | null;
  winnerSeatId: SeatId | null;
}

export type MembershipRole = 'owner' | 'member';

/** One card in a member's table list. Carries no subs, tokens, or board state. */
export interface TableSummary {
  tableId: string;
  tableName: string | null;
  role: MembershipRole;
  status: GameStatus;
  gameNumber: number;
  maxSeats: number;
  seats: Array<{ seatId: SeatId; displayName: string; avatarId: number; away: boolean; isYou: boolean }>;
  createdAt: string;
  joinedAt: string;
}

export interface MemberProfile {
  gamerTag: string | null;
  avatarId: number | null;
}

export type ServerMessage =
  | TableSnapshot
  | ShotEvent
  | ErrorMessage
  | { type: 'sat'; seatId: SeatId; seatToken: string }
  /** `taken_over` goes to a connection whose seat was resumed from another window or device. */
  | { type: 'left'; seatId: SeatId; reason?: 'taken_over' }
  /** `serverTs` lets the client estimate its offset from server time. */
  | { type: 'pong'; serverTs: number }
  | { type: 'my_tables'; you: MemberProfile; tables: TableSummary[] }
  | { type: 'table_created'; table: TableSummary }
  | { type: 'table_forgotten'; tableId: string }
  | { type: 'table_deleted'; tableId: string };

export type ServerMessageType = ServerMessage['type'];

/** Replies the lobby waits for on its short-lived member socket. */
export type MemberReply = Extract<
  ServerMessage,
  { type: 'my_tables' | 'table_created' | 'table_forgotten' | 'table_deleted' | 'error' }
>;
