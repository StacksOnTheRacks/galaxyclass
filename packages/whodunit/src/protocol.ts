/**
 * The Whodunit? wire contract, shared by the runtime and the client. Server records live in
 * `runtime/types.ts` and never cross the wire; the client imports only this module and `rules/`.
 */
import type {
  CardId,
  DepartReason,
  Destination,
  EndReason,
  GameStatus,
  MoveVia,
  RoomId,
  SeatId,
  Solution,
  Suggestion,
  SuspectId,
  TokenPosition,
  TurnPhase,
  WeaponId,
} from './rules/types.js';

export type {
  CardId,
  DepartReason,
  Destination,
  EndReason,
  GameStatus,
  MoveVia,
  RoomId,
  SeatId,
  Solution,
  Suggestion,
  SuspectId,
  TokenPosition,
  TurnPhase,
  WeaponId,
};

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
  /** Setup only. Claims an unclaimed suspect as your token; clears ready. */
  | { action: 'choose_suspect'; seatToken: string; suspect: SuspectId }
  /** Setup only, once you have a suspect. */
  | { action: 'ready'; seatToken: string }
  | { action: 'unready'; seatToken: string }
  /** Setup, host only: every seated detective has a suspect, is ready, and is connected; at least MIN_PLAYERS. */
  | { action: 'start_game'; seatToken: string }
  /** Your turn, phase `start`. The server rolls two dice. */
  | { action: 'roll'; seatToken: string }
  /** Your turn, phase `start`, standing in a corner room with a secret passage. */
  | { action: 'take_passage'; seatToken: string }
  /** Your turn, phase `moving`. Any destination `reachable` with the roll. */
  | { action: 'move'; seatToken: string; to: Destination }
  /** Your turn: in a room you entered this turn (`moved`), or one a suggestion pulled you into (`start`). */
  | { action: 'suggest'; seatToken: string; suspect: SuspectId; weapon: WeaponId }
  /** You are `refuterSeatId`: privately show the suggester one of your matching cards. */
  | { action: 'show_card'; seatToken: string; card: CardId }
  /** Your turn, any phase but `refuting`. Wrong means you are out of the running (you still refute). */
  | { action: 'accuse'; seatToken: string; suspect: SuspectId; weapon: WeaponId; room: RoomId }
  /** Your turn, any phase but `refuting`. */
  | { action: 'end_turn'; seatToken: string }
  /** Finished, host only: back to setup with the same detectives and suspects. */
  | { action: 'new_game'; seatToken: string }
  /** Setup or playing: removes every seat away past the limit (their cards are laid face up mid-case). */
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
  'choose_suspect',
  'ready',
  'unready',
  'start_game',
  'roll',
  'take_passage',
  'move',
  'suggest',
  'show_card',
  'accuse',
  'end_turn',
  'new_game',
  'claim_abandoned',
] as const satisfies readonly ClientActionName[];

/** The server owns the case file, hands, tokens, dice, turns, and results. A frame carrying any of these keys is refused. */
export const CLIENT_SUPPLIED_STATE_KEYS = [
  'game',
  'solution',
  'hands',
  'hand',
  'positions',
  'weapons',
  'log',
  'events',
  'history',
  'dice',
  'roll',
  'path',
  'turn',
  'seats',
  'players',
  'eliminated',
  'currentSeatId',
  'turnNumber',
  'winnerSeatId',
  'status',
  'result',
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
  'not_setup',
  'not_playing',
  'not_finished',
  /** `start_game` / `new_game` from someone other than the table's host. */
  'not_host',
  'invalid_suspect',
  'suspect_taken',
  'no_suspect',
  'not_enough_players',
  'players_not_ready',
  'not_your_turn',
  /** The previous event's animation is still playing. */
  'turn_not_open',
  'wrong_phase',
  'no_passage',
  'invalid_destination',
  'unreachable',
  'cannot_suggest',
  'invalid_weapon',
  'invalid_room',
  'not_refuter',
  'invalid_card',
  'cannot_show',
  'eliminated',
  'no_one_away',
  'away_too_recent',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
}

/** One of the six seats, as everyone joined to the table sees it. Never carries subs, tokens, or cards. */
export interface PublicSeat {
  seatId: SeatId;
  occupied: boolean;
  displayName: string | null;
  avatarId: number | null;
  /** This seat is the viewer's own. */
  isLocal: boolean;
  /** False while the seated detective has no open connection. */
  connected: boolean;
  awaySince: string | null;
  /** The suspect token this detective plays. */
  suspect: SuspectId | null;
  /** Setup: ready to start. */
  ready: boolean;
  /** Starts the case and opens the next one. */
  isHost: boolean;
  /** Accused wrongly this case: still refutes, no longer takes turns. */
  eliminated: boolean;
  /** Cards in hand; null outside a case. */
  handSize: number | null;
}

/** The current turn, as every detective in the case sees it. */
export interface PublicTurn {
  phase: TurnPhase;
  /** The dice, once rolled this turn. */
  dice: [number, number] | null;
  /** The room the detective entered this turn (by walking or a secret passage). */
  enteredRoom: RoomId | null;
  /** The suggestion made this turn. */
  suggestion: Suggestion | null;
  /** While `refuting`: who must show a card. */
  refuterSeatId: SeatId | null;
  /** Detectives asked so far this suggestion who could not refute, in order. */
  passed: SeatId[];
}

interface EventBase {
  /** `${gameNumber}-${seq}`; unique per table, so clients can de-duplicate replays. */
  eventId: string;
  gameNumber: number;
  seq: number;
  /** Server epoch ms of the action that produced this event. */
  serverTs: number;
  /** When this event's animation starts, ms after `serverTs` (events of one action play in sequence). */
  delayMs: number;
  animationMs: number;
}

/**
 * Everything that happens in a case, in order. Kept as the case log, sent live as `event`, and
 * replayed in the recap. Every field is public to every detective in the case except `card` on
 * `refuted`, which only the suggester and the refuter ever receive.
 */
export type GameEvent =
  | (EventBase & { kind: 'game_started'; firstSeatId: SeatId; weapons: Record<WeaponId, RoomId> })
  | (EventBase & { kind: 'rolled'; seatId: SeatId; dice: [number, number] })
  | (EventBase & { kind: 'moved'; seatId: SeatId; suspect: SuspectId; via: MoveVia; path: TokenPosition[] })
  | (EventBase & {
      kind: 'suggested';
      seatId: SeatId;
      suspect: SuspectId;
      weapon: WeaponId;
      room: RoomId;
      /** Where the named suspect and weapon were pulled in from. */
      suspectFrom: TokenPosition;
      weaponFrom: RoomId;
      /** The detective playing the named suspect, when someone does: they may suggest from here next turn. */
      pulledSeatId: SeatId | null;
      /** Asked in turn, clockwise, and could not refute. */
      passed: SeatId[];
      /** The first who can refute and must now show a card; null when nobody can. */
      refuterSeatId: SeatId | null;
    })
  | (EventBase & { kind: 'refuted'; suggesterSeatId: SeatId; refuterSeatId: SeatId; card?: CardId })
  | (EventBase & { kind: 'accused'; seatId: SeatId; suspect: SuspectId; weapon: WeaponId; room: RoomId; correct: boolean })
  | (EventBase & { kind: 'turn_passed'; seatId: SeatId; nextSeatId: SeatId })
  | (EventBase & { kind: 'departed'; seatId: SeatId; reason: DepartReason; revealed: CardId[] })
  | (EventBase & { kind: 'game_over'; winnerSeatId: SeatId | null; reason: EndReason; solution: Solution });

export type GameEventKind = GameEvent['kind'];

/** Your own view: your hand, and what is being asked of you. */
export interface YouView {
  seatId: SeatId;
  suspect: SuspectId | null;
  /** Your cards; empty outside a case. */
  hand: CardId[];
  /** Set while you are the one who must show the suggester a card: the cards of yours that match. */
  refute: { suggesterSeatId: SeatId; suggestion: Suggestion; matching: CardId[] } | null;
  /** A suggestion moved your token into this room since your last turn: you may suggest here without moving. */
  pulledIn: boolean;
}

export interface RosterEntry {
  displayName: string;
  avatarId: number;
  suspect: SuspectId | null;
}

/** The case closed: present only when finished, to detectives who played it. */
export interface GameRecap {
  solution: Solution;
  /** Every detective's hand, laid face up at the end. */
  hands: Partial<Record<SeatId, CardId[]>>;
  roster: Partial<Record<SeatId, RosterEntry>>;
  /** The whole case log, with `card` only where the viewer was the suggester or refuter. */
  events: GameEvent[];
  startedAt: string | null;
  endedAt: string | null;
}

/**
 * Seat-scoped: each connection gets its own. A connection without a seat in the case gets no board,
 * no log, and `you` null; during setup it still sees the seats so it can sit.
 */
export interface TableSnapshot {
  type: 'table_snapshot';
  tableId: string;
  version: number;
  tableName: string | null;
  gameNumber: number;
  status: GameStatus;
  seats: PublicSeat[];
  hostSeatId: SeatId | null;
  /** Detectives in this case, in turn order (seat order). Empty in setup. */
  players: SeatId[];
  currentSeatId: SeatId | null;
  turnNumber: number;
  turn: PublicTurn | null;
  /** Server epoch ms the next action is accepted; null outside a case. */
  nextActionAt: number | null;
  /** Server epoch ms this snapshot was built; feeds the client's clock-offset estimate. */
  serverTs: number;
  /** Every suspect token; null for a viewer outside the case. */
  positions: Record<SuspectId, TokenPosition> | null;
  /** Every weapon token's room; null before the case starts and for a viewer outside it. */
  weapons: Record<WeaponId, RoomId> | null;
  /** Detectives whose token a suggestion moved since their last turn. */
  pulledIn: SeatId[];
  /** Cards of detectives who left mid-case, laid face up for everyone. */
  revealedCards: CardId[];
  /** The case log, redacted for this viewer; empty for a viewer outside the case. */
  log: GameEvent[];
  winnerSeatId: SeatId | null;
  endReason: EndReason | null;
  /** The case file, only once finished. */
  solution: Solution | null;
  you: YouView | null;
  recap?: GameRecap;
}

/**
 * Sent to each detective in the case, redacted for them, immediately before the snapshots that
 * include it, so everyone plays the same animation on the same clock.
 */
export interface EventMessage {
  type: 'event';
  tableId: string;
  event: GameEvent;
  /** Who acts next and when, once this event (and the rest of its action) has played. */
  currentSeatId: SeatId | null;
  nextActionAt: number | null;
}

export type MembershipRole = 'owner' | 'member';

/** One card in a member's table list. Carries no subs, tokens, or cards. */
export interface TableSummary {
  tableId: string;
  tableName: string | null;
  role: MembershipRole;
  status: GameStatus;
  gameNumber: number;
  maxSeats: number;
  seats: Array<{ seatId: SeatId; displayName: string; avatarId: number; away: boolean; isYou: boolean; suspect: SuspectId | null }>;
  createdAt: string;
  joinedAt: string;
}

export interface MemberProfile {
  gamerTag: string | null;
  avatarId: number | null;
}

export type ServerMessage =
  | TableSnapshot
  | EventMessage
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
