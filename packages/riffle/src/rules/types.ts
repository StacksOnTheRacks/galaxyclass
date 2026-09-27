export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Suit = 's' | 'h' | 'd' | 'c';
export type Card = `${Rank}${Suit}`;

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type Phase =
  | 'betting'
  | 'street_complete'
  | 'fold_to_one'
  | 'showdown_ready'
  | 'complete';

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number };

export type LegalizedAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call'; amount: number }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number };

export type ActionType = Action['type'];

export type RulesErrorCode =
  | 'invalid_config'
  | 'off_turn'
  | 'illegal_action'
  | 'all_in_or_side_pot_unsupported'
  | 'street_not_complete'
  | 'cannot_advance'
  | 'not_fold_to_one'
  | 'not_showdown'
  | 'already_complete';

export type RulesError = { code: RulesErrorCode; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: RulesError };

export type Rng = {
  /** Uniform integer in [0, maxExclusive). maxExclusive is an integer >= 1. */
  nextInt(maxExclusive: number): number;
};

export type SeatConfig = { seatId: string; stack: number };

export type DealConfig = {
  seats: SeatConfig[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
  rng: Rng;
};

export type RulesOptions = {
  allowAllIn?: boolean;
};

export type Pot = {
  label: string;
  amount: number;
  eligibleSeatIds: string[];
};

export type SeatState = {
  seatId: string;
  stack: number;
  hole: [Card, Card];
  folded: boolean;
  allIn?: boolean;
  streetCommitted: number;
  handCommitted: number;
};

export type Winner = {
  seatId: string;
  amount: number;
  rankName?: string;
};

export type HandState = {
  seats: SeatState[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
  street: Street;
  phase: Phase;
  currentSeatId: string | null;
  board: Card[];
  pot: number;
  pots?: Pot[];
  currentBet: number;
  lastRaiseSize: number;
  deckRemaining: Card[];
  burns: Card[];
  winners: Winner[] | null;
  completeReason: 'fold_to_one' | 'showdown' | null;
};
