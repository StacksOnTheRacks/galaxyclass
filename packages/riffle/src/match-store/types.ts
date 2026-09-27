import type { Card } from '../rules/types.js';
import type { HandCompleteReason, MoveLogItem } from '../server/hands/move-types.js';
import type { MatchStoreErrorCode } from './errors.js';

export type MatchSeat = {
  seatId: string;
  playerSubject: string | null;
  displayName: string | null;
  stack: number;
};

export type HiddenView = {
  hole: [Card, Card];
};

export type InProcessShoe = {
  kind: 'dealer_shoe';
  deckRemaining: Card[];
  burns: Card[];
};

export type MatchRecord = {
  matchId: string;
  seats: MatchSeat[];
  currentSeat: string | null;
  hiddenViews: Map<string, HiddenView>;
  moves: MoveLogItem[];
  shoe: InProcessShoe | null;
  locked: boolean;
};

export type MatchStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MatchStoreErrorCode; status: 400 | 403 | 404 | 409 };

export type PublicMatchSeat = {
  seatId: string;
  playerSubject: string | null;
  displayName: string | null;
  stack: number;
};

export type PublicMatchState = {
  matchId: string;
  seats: PublicMatchSeat[];
  currentSeat: string | null;
  pot?: number;
  board?: Card[];
  street?: string;
  completeReason?: HandCompleteReason;
  winners?: Array<{ seatId: string; amount: number }>;
  shownHoles?: Array<{ seatId: string; hole: [Card, Card] }>;
};

export type SeatMatchView = PublicMatchState & {
  seatId: string;
  hole: [Card, Card] | null;
};

export type HoldWriteHandle = {
  release: () => void;
};
