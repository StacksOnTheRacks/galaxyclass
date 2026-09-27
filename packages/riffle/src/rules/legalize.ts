import { err, ok } from './errors.js';
import {
  maxBetOrRaiseAmount,
  minOpeningWager,
  minRaiseTo,
  stillInSeats,
  toCall,
} from './state.js';
import type {
  Action,
  HandState,
  LegalizedAction,
  Result,
  RulesOptions,
  SeatState,
} from './types.js';

function actorSeat(state: HandState, seatId: string): SeatState | null {
  const seat = state.seats.find((s) => s.seatId === seatId);
  return seat ?? null;
}

function validateActionShape(action: Action): Result<void> {
  switch (action.type) {
    case 'fold':
    case 'check':
    case 'call':
      return ok(undefined);
    case 'bet':
    case 'raise':
      if (!Number.isInteger(action.amount) || action.amount <= 0) {
        return err('illegal_action', 'bet/raise amount must be a positive integer');
      }
      return ok(undefined);
    default:
      return err('illegal_action', 'unknown action type');
  }
}

function canBetWithoutSidePot(state: HandState, seat: SeatState, amount: number): boolean {
  const newLevel = seat.streetCommitted + amount;
  if (amount >= seat.stack) {
    return false;
  }
  if (seat.stack - amount < 1) {
    return false;
  }
  return maxBetOrRaiseAmount(state, seat, newLevel) === newLevel;
}

function canRaiseToWithoutSidePot(state: HandState, seat: SeatState, raiseTo: number): boolean {
  const chipsToAdd = raiseTo - seat.streetCommitted;
  if (chipsToAdd >= seat.stack || seat.stack - chipsToAdd < 1) {
    return false;
  }
  return maxBetOrRaiseAmount(state, seat, raiseTo) === raiseTo;
}

function isFullStackCommit(seat: SeatState, amount: number): boolean {
  return amount === seat.stack;
}

function isFullStackRaiseTo(seat: SeatState, raiseTo: number): boolean {
  return raiseTo - seat.streetCommitted === seat.stack;
}

export function legalize(
  state: HandState,
  seatId: string,
  action: Action,
  options: RulesOptions = {},
): Result<LegalizedAction> {
  const allowAllIn = options.allowAllIn === true;

  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }
  if (state.phase !== 'betting') {
    return err('illegal_action', 'actions are only allowed during betting');
  }
  if (state.currentSeatId !== seatId) {
    return err('off_turn', 'not this seat\'s turn');
  }

  const seat = actorSeat(state, seatId);
  if (!seat || seat.folded) {
    return err('off_turn', 'seat is not active');
  }

  const shape = validateActionShape(action);
  if (!shape.ok) {
    return shape as Result<LegalizedAction>;
  }

  const callAmount = toCall(seat, state.currentBet);
  const minOpen = minOpeningWager(state);
  const minRaise = minRaiseTo(state);

  switch (action.type) {
    case 'fold':
      return ok({ type: 'fold' });

    case 'check':
      if (callAmount > 0) {
        return err('illegal_action', 'cannot check while facing a bet');
      }
      return ok({ type: 'check' });

    case 'call':
      if (callAmount <= 0) {
        return err('illegal_action', 'nothing to call');
      }
      if (callAmount > seat.stack) {
        return err('illegal_action', 'insufficient stack to call');
      }
      if (callAmount === seat.stack) {
        if (!allowAllIn) {
          return err('all_in_or_side_pot_unsupported', 'call would all-in or create a side pot');
        }
        return ok({ type: 'call', amount: callAmount });
      }
      if (seat.stack <= callAmount) {
        return err('all_in_or_side_pot_unsupported', 'call would all-in or create a side pot');
      }
      return ok({ type: 'call', amount: callAmount });

    case 'bet':
      if (callAmount > 0 || state.currentBet > 0) {
        return err('illegal_action', 'cannot bet while facing a bet');
      }
      if (action.amount < minOpen && action.amount !== seat.stack) {
        return err('illegal_action', 'bet below minimum');
      }
      if (isFullStackCommit(seat, action.amount)) {
        if (!allowAllIn) {
          return err('all_in_or_side_pot_unsupported', 'bet would all-in or create a side pot');
        }
        return ok({ type: 'bet', amount: action.amount });
      }
      if (!canBetWithoutSidePot(state, seat, action.amount)) {
        return err('all_in_or_side_pot_unsupported', 'bet would all-in or create a side pot');
      }
      return ok({ type: 'bet', amount: action.amount });

    case 'raise': {
      if (callAmount <= 0) {
        return err('illegal_action', 'nothing to raise');
      }
      if (isFullStackRaiseTo(seat, action.amount)) {
        if (!allowAllIn) {
          return err('all_in_or_side_pot_unsupported', 'raise would all-in or create a side pot');
        }
        if (action.amount < seat.streetCommitted + callAmount) {
          return err('illegal_action', 'raise below call amount');
        }
        return ok({ type: 'raise', amount: action.amount });
      }
      if (action.amount < minRaise) {
        return err('illegal_action', 'raise below minimum');
      }
      if (!canRaiseToWithoutSidePot(state, seat, action.amount)) {
        return err('all_in_or_side_pot_unsupported', 'raise would all-in or create a side pot');
      }
      return ok({ type: 'raise', amount: action.amount });
    }

    default:
      return err('illegal_action', 'unknown action type');
  }
}

export function legalActions(
  state: HandState,
  seatId: string,
  options: RulesOptions = {},
): LegalizedAction[] {
  const allowAllIn = options.allowAllIn === true;

  if (state.phase !== 'betting' || state.currentSeatId !== seatId) {
    return [];
  }

  const seat = actorSeat(state, seatId);
  if (!seat || seat.folded || seat.allIn || seat.stack === 0) {
    return [];
  }

  const actions: LegalizedAction[] = [{ type: 'fold' }];
  const callAmount = toCall(seat, state.currentBet);

  if (callAmount === 0) {
    actions.push({ type: 'check' });
    const minBet = minOpeningWager(state);
    if (state.currentBet === 0) {
      if (canBetWithoutSidePot(state, seat, minBet)) {
        actions.push({ type: 'bet', amount: minBet });
      } else if (allowAllIn && seat.stack >= minBet) {
        actions.push({ type: 'bet', amount: seat.stack });
      }
    }
  } else {
    if (seat.stack > callAmount) {
      actions.push({ type: 'call', amount: callAmount });
      const minRaise = minRaiseTo(state);
      if (canRaiseToWithoutSidePot(state, seat, minRaise)) {
        actions.push({ type: 'raise', amount: minRaise });
      }
    } else if (allowAllIn && seat.stack === callAmount) {
      actions.push({ type: 'call', amount: callAmount });
    } else if (allowAllIn && seat.stack > callAmount) {
      actions.push({ type: 'call', amount: callAmount });
      actions.push({ type: 'raise', amount: seat.streetCommitted + seat.stack });
    }
  }

  return actions;
}

export function stillInCount(state: HandState): number {
  return stillInSeats(state).length;
}
