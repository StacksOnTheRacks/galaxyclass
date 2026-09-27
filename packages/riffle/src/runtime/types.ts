import type { Card, Phase, Pot, Street, Winner } from '../rules/types.js';

export type TableStatus = 'open' | 'hand_in_progress';

export interface BlindsConfig {
  smallBlind: number;
  bigBlind: number;
}

export interface TableRecord {
  tableId: string;
  version: number;
  status: TableStatus;
  createdAt: string;
  defaultStack: number;
  maxSeats: number;
  blinds: BlindsConfig;
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
}

export interface SeatRecord {
  seatId: string;
  displayName: string;
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
  seatId?: string;
  displayName?: string;
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
  isLocal: boolean;
  stack: number;
  inHand: boolean;
  committed: number;
  position: 'D' | 'SB' | 'BB' | null;
  acting: boolean;
  folded: boolean;
  allIn?: boolean;
  away?: boolean;
  holeCards?: [Card, Card];
  wonAmount?: number;
}

export interface SnapshotPot {
  label: string;
  amount: number;
}

export interface TableSnapshotMessage {
  type: 'table_snapshot';
  tableId: string;
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
  seats: PlayerSnapshotSeat[];
  pocketCards?: [Card, Card];
}

export interface ErrorMessage {
  type: 'error';
  code: string;
}

export type OutboundMessage =
  | TableCreatedMessage
  | SatMessage
  | TableSnapshotMessage
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
}

export const TABLE_DEFAULTS = {
  defaultStack: 2000,
  maxSeats: 8,
  blinds: { smallBlind: 1, bigBlind: 2 },
} as const;
