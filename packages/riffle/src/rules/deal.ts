import { createDeck, shuffleDeck } from './cards.js';
import { err, ok } from './errors.js';
import {
  bigBlindSeatId,
  cloneHandState,
  firstToActPreflop,
  getHandMeta,
  postBlind,
  seatIndex,
  smallBlindSeatId,
} from './state.js';
import type { Card, DealConfig, HandState, Result, SeatState } from './types.js';

function validateDealConfig(config: DealConfig): Result<void> {
  const { seats, buttonSeatId, blinds, rng } = config;
  if (!rng || typeof rng.nextInt !== 'function') {
    return err('invalid_config', 'rng is required');
  }
  if (seats.length < 2 || seats.length > 9) {
    return err('invalid_config', 'seat count must be between 2 and 9');
  }
  if (!Number.isInteger(blinds.smallBlind) || !Number.isInteger(blinds.bigBlind)) {
    return err('invalid_config', 'blinds must be integers');
  }
  if (blinds.smallBlind < 1 || blinds.smallBlind >= blinds.bigBlind) {
    return err('invalid_config', 'small blind must be >= 1 and less than big blind');
  }

  const ids = new Set<string>();
  for (const seat of seats) {
    if (!seat.seatId || ids.has(seat.seatId)) {
      return err('invalid_config', 'seatIds must be unique and non-empty');
    }
    ids.add(seat.seatId);
    if (!Number.isInteger(seat.stack) || seat.stack <= blinds.bigBlind) {
      return err('invalid_config', 'each stack must be an integer strictly greater than the big blind');
    }
  }

  if (!ids.has(buttonSeatId)) {
    return err('invalid_config', 'buttonSeatId must reference a seated player');
  }

  return ok(undefined);
}

function dealOrder(state: HandState): string[] {
  const sb = smallBlindSeatId(state);
  const order: string[] = [];
  let cursor = sb;
  for (let i = 0; i < state.seats.length; i += 1) {
    order.push(cursor);
    const idx = seatIndex(state, cursor);
    cursor = state.seats[(idx + 1) % state.seats.length].seatId;
  }
  return order;
}

function drawCards(deck: Card[], count: number): { drawn: Card[]; rest: Card[] } {
  return { drawn: deck.slice(0, count), rest: deck.slice(count) };
}

export function dealHand(config: DealConfig): Result<HandState> {
  const validation = validateDealConfig(config);
  if (!validation.ok) {
    return validation as Result<HandState>;
  }

  const shuffled = shuffleDeck(createDeck(), config.rng);
  let deck = shuffled;

  const seatStates: SeatState[] = config.seats.map((s) => ({
    seatId: s.seatId,
    stack: s.stack,
    hole: ['2c', '2d'] as [Card, Card],
    folded: false,
    streetCommitted: 0,
    handCommitted: 0,
  }));

  const provisional: HandState = {
    seats: seatStates,
    buttonSeatId: config.buttonSeatId,
    blinds: { ...config.blinds },
    street: 'preflop',
    phase: 'betting',
    currentSeatId: null,
    board: [],
    pot: 0,
    currentBet: 0,
    lastRaiseSize: config.blinds.bigBlind,
    deckRemaining: deck,
    burns: [],
    winners: null,
    completeReason: null,
  };

  const order = dealOrder(provisional);
  for (const round of [0, 1] as const) {
    for (const seatId of order) {
      const seat = provisional.seats[seatIndex(provisional, seatId)];
      const { drawn, rest } = drawCards(deck, 1);
      deck = rest;
      if (round === 0) {
        seat.hole[0] = drawn[0];
      } else {
        seat.hole[1] = drawn[0];
      }
    }
  }

  const sbSeat = provisional.seats[seatIndex(provisional, smallBlindSeatId(provisional))];
  const bbSeat = provisional.seats[seatIndex(provisional, bigBlindSeatId(provisional))];

  if (sbSeat.stack <= config.blinds.smallBlind || bbSeat.stack <= config.blinds.bigBlind) {
    return err('all_in_or_side_pot_unsupported', 'posting blinds would all-in a seat');
  }

  provisional.pot = postBlind(sbSeat, config.blinds.smallBlind, provisional.pot);
  provisional.pot = postBlind(bbSeat, config.blinds.bigBlind, provisional.pot);
  provisional.currentBet = config.blinds.bigBlind;
  provisional.lastRaiseSize = config.blinds.bigBlind;
  provisional.deckRemaining = deck;
  provisional.currentSeatId = firstToActPreflop(provisional);

  const state = cloneHandState(provisional);
  const meta = getHandMeta(state);
  meta.actedThisStreet.clear();
  meta.lastAggressorSeatId = null;

  return ok(state);
}
