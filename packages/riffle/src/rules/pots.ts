import { compareEvaluated, evaluateSeven } from './rank.js';
import type { EvaluatedHand } from './rank.js';
import { awardRemainderClockwiseFromButton, seatIndex, stillInSeats } from './state.js';
import type { HandState, Pot, SeatState, Winner } from './types.js';

export function returnUncalledChips(state: HandState): void {
  const contributors = state.seats.filter((seat) => seat.handCommitted > 0);
  if (contributors.length === 0) {
    return;
  }

  const sorted = [...contributors].sort((a, b) => b.handCommitted - a.handCommitted);
  const highest = sorted[0]!.handCommitted;
  const secondHighest =
    sorted.length > 1 ? sorted[1]!.handCommitted : 0;
  const uncalled = highest - secondHighest;
  if (uncalled <= 0) {
    return;
  }

  const bettor = sorted[0]!;
  bettor.stack += uncalled;
  bettor.handCommitted -= uncalled;
  bettor.streetCommitted = Math.min(bettor.streetCommitted, bettor.handCommitted);
  state.pot -= uncalled;
}

export function buildSidePots(state: HandState): Pot[] {
  const levels = [
    ...new Set(
      state.seats
        .filter((seat) => seat.handCommitted > 0)
        .map((seat) => seat.handCommitted),
    ),
  ].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previous = 0;
  for (const level of levels) {
    const band = level - previous;
    const contributors = state.seats.filter((seat) => seat.handCommitted >= level);
    const amount = band * contributors.length;
    if (amount <= 0) {
      continue;
    }
    const eligibleSeatIds = stillInSeats(state)
      .filter((seat) => seat.handCommitted >= level)
      .map((seat) => seat.seatId);
    pots.push({
      label: pots.length === 0 ? 'Main' : pots.length === 1 ? 'Side' : `Side ${pots.length}`,
      amount,
      eligibleSeatIds,
    });
    previous = level;
  }

  return pots;
}

function awardPot(
  state: HandState,
  pot: Pot,
  evaluations: Map<string, EvaluatedHand>,
): Winner[] {
  const eligible = pot.eligibleSeatIds.filter((seatId) => {
    const seat = state.seats.find((row) => row.seatId === seatId);
    return seat && !seat.folded;
  });

  if (eligible.length === 0) {
    return [];
  }

  if (eligible.length === 1) {
    const seatId = eligible[0]!;
    return [
      {
        seatId,
        amount: pot.amount,
        rankName: evaluations.get(seatId)?.rankName,
      },
    ];
  }

  let best: EvaluatedHand | null = null;
  for (const seatId of eligible) {
    const evald = evaluations.get(seatId)!;
    if (!best || compareEvaluated(evald, best) > 0) {
      best = evald;
    }
  }

  const winnerIds = eligible.filter(
    (seatId) => compareEvaluated(evaluations.get(seatId)!, best!) === 0,
  );
  const baseShare = Math.floor(pot.amount / winnerIds.length);
  const remainder = pot.amount - baseShare * winnerIds.length;
  const extra = awardRemainderClockwiseFromButton(state, winnerIds, remainder);

  return winnerIds.map((seatId) => ({
    seatId,
    amount: baseShare + (extra.get(seatId) ?? 0),
    rankName: evaluations.get(seatId)!.rankName,
  }));
}

export function settlePots(state: HandState): { pots: Pot[]; winners: Winner[] } {
  returnUncalledChips(state);
  let pots = buildSidePots(state);
  if (pots.length === 0 && state.pot > 0) {
    pots = [
      {
        label: 'Main',
        amount: state.pot,
        eligibleSeatIds: stillInSeats(state).map((seat) => seat.seatId),
      },
    ];
  }
  const stillIn = stillInSeats(state);
  const evaluations = new Map<string, EvaluatedHand>();

  if (stillIn.length >= 2 && state.board.length === 5) {
    for (const seat of stillIn) {
      evaluations.set(seat.seatId, evaluateSeven(seat.hole, state.board));
    }
  }

  const winners: Winner[] = [];
  for (const pot of pots) {
    winners.push(...awardPot(state, pot, evaluations));
  }

  return { pots, winners };
}

export function applyAwards(state: HandState, winners: Winner[]): void {
  for (const winner of winners) {
    state.seats[seatIndex(state, winner.seatId)].stack += winner.amount;
  }
  state.pot = 0;
}

export function mergeWinnersBySeat(winners: Winner[]): Winner[] {
  const merged = new Map<string, Winner>();
  for (const winner of winners) {
    const existing = merged.get(winner.seatId);
    if (existing) {
      existing.amount += winner.amount;
    } else {
      merged.set(winner.seatId, { ...winner });
    }
  }
  return [...merged.values()];
}

export function seatsWithChipsRemaining(seats: SeatState[]): number {
  return seats.filter((seat) => !seat.folded && seat.stack > 0).length;
}
