import {
  applyAction,
  advanceStreet,
  createSeededRng,
  dealHand,
  type Action,
  type Card,
  type DealConfig,
  type HandState,
} from '../../src/rules/index.js';

export const FIXTURE_STACK = 10000;
export const FIXTURE_SB = 50;
export const FIXTURE_BB = 100;

export function huDealConfig(seed = 42): DealConfig {
  return {
    seats: [
      { seatId: 's0', stack: FIXTURE_STACK },
      { seatId: 's1', stack: FIXTURE_STACK },
    ],
    buttonSeatId: 's0',
    blinds: { smallBlind: FIXTURE_SB, bigBlind: FIXTURE_BB },
    rng: createSeededRng(seed),
  };
}

export function threeSeatDealConfig(seed = 99): DealConfig {
  return {
    seats: [
      { seatId: 's0', stack: FIXTURE_STACK },
      { seatId: 's1', stack: FIXTURE_STACK },
      { seatId: 's2', stack: FIXTURE_STACK },
    ],
    buttonSeatId: 's0',
    blinds: { smallBlind: FIXTURE_SB, bigBlind: FIXTURE_BB },
    rng: createSeededRng(seed),
  };
}

export function altDealConfig(): DealConfig {
  return {
    seats: [
      { seatId: 'a', stack: 5000 },
      { seatId: 'b', stack: 7500 },
    ],
    buttonSeatId: 'a',
    blinds: { smallBlind: 25, bigBlind: 50 },
    rng: createSeededRng(7),
  };
}

export function snapshotState(state: HandState): string {
  return JSON.stringify(state);
}

export function assertStateUnchanged(before: HandState, after: HandState): void {
  if (snapshotState(before) !== snapshotState(after)) {
    throw new Error('hand state mutated on reject');
  }
}

export function mustDeal(config: DealConfig = huDealConfig()): HandState {
  const result = dealHand(config);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

export function act(state: HandState, seatId: string, action: Action): HandState {
  const result = applyAction(state, seatId, action);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

export function rejectAct(state: HandState, seatId: string, action: Action) {
  return applyAction(state, seatId, action);
}

export function advance(state: HandState): HandState {
  const result = advanceStreet(state);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

/** Complete preflop with all callers then BB check (3-seat UTG=s0, SB=s1, BB=s2). */
export function completePreflopThreeSeat(state: HandState): HandState {
  let s = state;
  s = act(s, 's0', { type: 'call' });
  s = act(s, 's1', { type: 'call' });
  s = act(s, 's2', { type: 'check' });
  return s;
}

/** Complete preflop heads-up: SB/button calls, BB checks. */
export function completePreflopHu(state: HandState): HandState {
  let s = state;
  s = act(s, 's0', { type: 'call' });
  s = act(s, 's1', { type: 'check' });
  return s;
}

/** Check down a postflop street for all still-in seats. */
export function checkDownStreet(state: HandState): HandState {
  let s = state;
  const seen = new Set<string>();
  while (s.phase === 'betting' && s.currentSeatId) {
    if (seen.has(s.currentSeatId)) {
      throw new Error('checkDownStreet stuck');
    }
    seen.add(s.currentSeatId);
    s = act(s, s.currentSeatId, { type: 'check' });
  }
  return s;
}

export function setSeatHoles(state: HandState, seatId: string, hole: [Card, Card]): HandState {
  return {
    ...state,
    seats: state.seats.map((seat) =>
      seat.seatId === seatId ? { ...seat, hole: [hole[0], hole[1]] } : seat,
    ),
  };
}

export function setBoard(state: HandState, board: Card[]): HandState {
  return { ...state, board: [...board] };
}
