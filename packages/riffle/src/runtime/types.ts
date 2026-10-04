import type { Card, Phase, Pot, Street, Winner } from '../rules/types.js';

export type TableStatus = 'open' | 'hand_in_progress';

export interface BlindsConfig {
  smallBlind: number;
  bigBlind: number;
}

export type StreetActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface StreetActionRecord {
  seatId: string;
  type: StreetActionType;
  /** Seat's total committed on the street after the action (call, bet, raise). */
  amount?: number;
  allIn?: boolean;
}

export interface TableRecord {
  tableId: string;
  version: number;
  status: TableStatus;
  createdAt: string;
  defaultStack: number;
  maxSeats: number;
  blinds: BlindsConfig;
  /** Stakes group this table belongs to, e.g. `the-limp`. Absent on tables created before groups. */
  groupId?: string;
  /** Lobby name shared by every table in the group, e.g. "The Limp". */
  tableName?: string;
  handNumber: number;
  buttonSeatId?: string;
  street?: Street | null;
  currentSeatId?: string | null;
  pot?: number;
  board?: Card[];
  phase?: Phase | null;
  currentBet?: number;
  lastRaiseSize?: number;
  deckRemaining?: Card[];
  burns?: Card[];
  actedThisStreet?: string[];
  lastAggressorSeatId?: string | null;
  shortAllInMatchedFromBet?: number | null;
  pots?: Pot[];
  winners?: Winner[] | null;
  completeReason?: 'fold_to_one' | 'showdown' | null;
  /** Public betting actions on the current street, in order. */
  streetActions?: StreetActionRecord[];
}

export interface SeatRecord {
  seatId: string;
  /** The verified account's gamer tag, or a server-picked guest name. */
  displayName: string;
  /** Galaxy Class avatar id: the verified account's pick, or random for guests. */
  avatarId?: number;
  /** Cognito `sub` of a verified account; never sent to clients. */
  playerSub?: string;
  stack: number;
  seatTokenHash: string;
  connectionId?: string;
  /** ISO time the seat lost its connection; seats away past the grace period are removed between hands. */
  awaySince?: string;
  /** Player left mid-hand; the seat is removed once the hand is over. */
  leaveAfterHand?: boolean;
  hole?: [Card, Card];
  folded?: boolean;
  streetCommitted?: number;
  handCommitted?: number;
  allIn?: boolean;
}

export interface ConnectionRecord {
  connectionId: string;
  tableId?: string;
  seatId?: string;
}

export interface ClientMessage {
  action: string;
  tableId?: string;
  tableIds?: unknown;
  groupId?: string;
  groupIds?: unknown;
  seatId?: string;
  /** Cognito access token on `sit`; the seat's name and avatar come only from the verified account. */
  accessToken?: unknown;
  seatToken?: string;
  amount?: number;
  stack?: number;
  stacks?: unknown;
  blinds?: BlindsConfig;
  pot?: number;
  deal?: unknown;
  hole?: unknown;
  holeCards?: unknown;
  board?: unknown;
  winners?: unknown;
  street?: unknown;
}

export interface TableCreatedMessage {
  type: 'table_created';
  tableId: string;
}

export interface SatMessage {
  type: 'sat';
  seatId: string;
  seatToken: string;
}

export interface PlayerSnapshotSeat {
  seatId: string;
  displayName: string;
  avatarId?: number;
  isLocal: boolean;
  stack: number;
  inHand: boolean;
  committed: number;
  position: 'D' | 'SB' | 'BB' | null;
  acting: boolean;
  folded: boolean;
  allIn?: boolean;
  away?: boolean;
  /** Seated after the deal; plays from the next hand. */
  waitingForNextHand?: boolean;
  holeCards?: [Card, Card];
  wonAmount?: number;
  /** Winner's made hand at showdown, e.g. "Pair of Aces". */
  wonHandLabel?: string;
}

export interface SnapshotPot {
  label: string;
  amount: number;
}

export interface SnapshotStreetAction extends StreetActionRecord {
  displayName: string;
}

export interface TableSnapshotMessage {
  type: 'table_snapshot';
  tableId: string;
  /** Group name, when the table belongs to one. */
  tableName?: string;
  version: number;
  status: TableStatus;
  createdAt: string;
  handNumber: number | null;
  street: Street | null;
  blindsLabel: string;
  seatedPlayersLabel: string;
  pot: number;
  pots?: SnapshotPot[];
  buttonSeatId: string | null;
  currentSeatId: string | null;
  phase?: Phase | null;
  completeReason?: 'fold_to_one' | 'showdown' | null;
  board?: Card[];
  toCall?: number;
  currentBet?: number;
  minRaiseTo?: number;
  bigBlind?: number;
  seats: PlayerSnapshotSeat[];
  pocketCards?: [Card, Card];
  streetActions?: SnapshotStreetAction[];
}

export interface ErrorMessage {
  type: 'error';
  code: string;
}

export interface GroupListEntry {
  groupId: string;
  seatedCount: number;
  tableCount: number;
  /** Seats taken at the table a new player would join. 0 when every table is full. */
  nextTableSeated: number;
}

export interface GroupListMessage {
  type: 'group_list';
  groups: GroupListEntry[];
}

export interface GroupTableMessage {
  type: 'group_table';
  groupId: string;
  tableId: string;
}

export type OutboundMessage =
  | TableCreatedMessage
  | SatMessage
  | TableSnapshotMessage
  | GroupListMessage
  | GroupTableMessage
  | ErrorMessage;

export interface WebSocketEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
  };
  body?: string | null;
}

export interface LambdaContext {
  functionName?: string;
}

export interface RuntimeEnv {
  tableName: string;
  awsRegion?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  profileTableName?: string;
}

export const TABLE_DEFAULTS = {
  defaultStack: 2000,
  maxSeats: 8,
  blinds: { smallBlind: 1, bigBlind: 2 },
} as const;
