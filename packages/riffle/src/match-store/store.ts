import { randomBytes } from 'node:crypto';
import { dealHand } from '../rules/deal.js';
import type { Rng } from '../rules/types.js';
import { createCryptoRng } from '../server/hands/rng.js';
import {
  buildActionPayload,
  buildHandOpenPayload,
  buildStreetDealPayload,
  findLatestHandComplete,
  isActionPayload,
  isHandCompletePayload,
  isHandOpenPayload,
  isStreetDealPayload,
  lastActionSeatId,
  type MoveLogItem,
} from '../server/hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../server/hands/reconstruct.js';
import { advanceStreet, applyAction, legalActions, legalize } from '../rules/index.js';
import type { Action, Card, HandState, LegalizedAction } from '../rules/types.js';
import { MATCH_BLINDS, MATCH_STARTING_STACK } from './constants.js';
import { hasClientSuppliedStateKeys } from './errors.js';
import type {
  HoldWriteHandle,
  MatchRecord,
  MatchStoreResult,
  PublicMatchState,
  SeatMatchView,
} from './types.js';

const PUBLIC_OMIT_KEYS = new Set([
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'HandState',
  'shoe',
  'deckRemaining',
  'burns',
  'hiddenViews',
]);

function generateMatchId(): string {
  return `m_${randomBytes(16).toString('base64url')}`;
}

function generateSeatId(): string {
  return `s_${randomBytes(8).toString('base64url')}`;
}

function fail<T>(
  error: MatchStoreResult<T> extends { ok: false; error: infer E } ? E : never,
  status: 400 | 403 | 404 | 409,
): MatchStoreResult<T> {
  return { ok: false, error, status };
}

function mapRulesReject(code: string): MatchStoreResult<never> | null {
  switch (code) {
    case 'off_turn':
      return fail('off_turn', 409);
    case 'illegal_action':
      return fail('illegal_action', 400);
    case 'all_in_or_side_pot_unsupported':
      return fail('all_in_or_side_pot_unsupported', 400);
    case 'already_complete':
      return fail('already_complete', 409);
    default:
      return fail('illegal_action', 400);
  }
}

export type ApplyPlayerActionResult = {
  seatId: string;
  hole: [Card, Card] | null;
  currentSeat: string | null;
  pot?: number;
  board?: Card[];
  seats: Array<{ seatId: string; stack: number }>;
  legalActions?: LegalizedAction[];
};

export type AdvanceStreetIfCompleteResult = {
  advanced: boolean;
  board?: Card[];
  street?: HandState['street'];
};

function shouldAdvanceAfterAction(state: HandState): boolean {
  return (
    state.phase === 'street_complete' &&
    (state.street === 'preflop' || state.street === 'flop' || state.street === 'turn')
  );
}

function reconstructRecordHand(record: MatchRecord) {
  const handOpen = findLatestHandOpen(record.moves);
  if (!handOpen) {
    return null;
  }

  const holesBySeat = new Map<string, [Card, Card]>();
  for (const [id, view] of record.hiddenViews) {
    holesBySeat.set(id, [view.hole[0], view.hole[1]]);
  }

  return reconstructHand({
    handOpen,
    actions: actionsAfterHandOpen(record.moves),
    holesBySeat,
    shoe: record.shoe,
  });
}

function advanceStreetInLock(
  record: MatchRecord,
): MatchStoreResult<AdvanceStreetIfCompleteResult> {
  const reconstructed = reconstructRecordHand(record);
  if (!reconstructed) {
    return { ok: true, value: { advanced: false } };
  }
  if (!reconstructed.ok) {
    return fail('reconstruct_failed', 400);
  }

  const state = reconstructed.value;
  if (!shouldAdvanceAfterAction(state)) {
    return { ok: true, value: { advanced: false } };
  }

  for (const seat of state.seats) {
    if (!seat.folded && seat.stack === 0) {
      return fail('all_in_or_side_pot_unsupported', 400);
    }
  }

  const advanced = advanceStreet(state);
  if (!advanced.ok) {
    switch (advanced.error.code) {
      case 'street_not_complete':
      case 'cannot_advance':
        return fail(advanced.error.code, 409);
      default:
        return fail('advance_failed', 400);
    }
  }

  const nextState = advanced.value;
  if (nextState.currentSeatId === null) {
    return fail('advance_failed', 400);
  }

  const actions = actionsAfterHandOpen(record.moves);
  const pathSeatId = lastActionSeatId(actions) ?? record.seats[0]!.seatId;
  const streetDealPayload = buildStreetDealPayload(
    nextState.street as 'flop' | 'turn' | 'river',
    nextState.board,
  );

  record.moves.push({
    seq: record.moves.length + 1,
    seatId: pathSeatId,
    payload: streetDealPayload,
    createdAt: new Date().toISOString(),
  });

  record.currentSeat = nextState.currentSeatId;
  for (const seatState of nextState.seats) {
    const matchSeat = record.seats.find((entry) => entry.seatId === seatState.seatId);
    if (matchSeat) {
      matchSeat.stack = seatState.stack;
    }
  }

  return {
    ok: true,
    value: {
      advanced: true,
      board: [...nextState.board],
      street: nextState.street,
    },
  };
}

function hasHandOpen(moves: MoveLogItem[]): boolean {
  return moves.some((item) => isHandOpenPayload(item.payload));
}

export function sanitizeForPublic(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForPublic);
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (PUBLIC_OMIT_KEYS.has(key)) {
        continue;
      }
      result[key] = sanitizeForPublic(val);
    }
    return result;
  }
  return value;
}

function buildPublicState(record: MatchRecord): PublicMatchState {
  const base: PublicMatchState = {
    matchId: record.matchId,
    seats: record.seats.map((seat) => ({
      seatId: seat.seatId,
      playerSubject: seat.playerSubject,
      displayName: seat.displayName,
      stack: seat.stack,
    })),
    currentSeat: record.currentSeat,
  };

  const handOpen = findLatestHandOpen(record.moves);
  if (!handOpen) {
    return base;
  }

  const holesBySeat = new Map<string, [import('../rules/types.js').Card, import('../rules/types.js').Card]>();
  for (const [seatId, view] of record.hiddenViews) {
    holesBySeat.set(seatId, [view.hole[0], view.hole[1]]);
  }

  const reconstructed = reconstructHand({
    handOpen,
    actions: actionsAfterHandOpen(record.moves),
    holesBySeat,
    shoe: record.shoe,
  });

  if (reconstructed.ok) {
    base.pot = reconstructed.value.pot;
    if (reconstructed.value.board.length > 0) {
      base.board = [...reconstructed.value.board];
    }
    base.street = reconstructed.value.street;
  }

  const complete = findLatestHandComplete(record.moves);
  if (complete) {
    base.completeReason = complete.reason;
    base.winners = complete.winners.map((winner) => ({
      seatId: winner.seatId,
      amount: winner.amount,
    }));
    if (complete.reason === 'showdown' && complete.shownHoles) {
      base.shownHoles = complete.shownHoles.map((shown) => ({
        seatId: shown.seatId,
        hole: [shown.hole[0], shown.hole[1]] as [import('../rules/types.js').Card, import('../rules/types.js').Card],
      }));
    }
  }

  return base;
}

export interface MatchStore {
  createMatch(input?: { seatCount?: number }): MatchStoreResult<{ matchId: string }>;
  addEmptySeats(matchId: string, count: number): MatchStoreResult<{ seatIds: string[] }>;
  setSeatOccupant(
    matchId: string,
    seatId: string,
    playerSubject: string | null,
  ): MatchStoreResult<{ seatId: string; playerSubject: string | null }>;
  claimEmptySeat(
    matchId: string,
    playerSubject: string,
  ): MatchStoreResult<{ seatId: string; created: boolean }>;
  findSeatForPlayer(
    matchId: string,
    playerSubject: string,
  ): MatchStoreResult<{ seatId: string }>;
  setSeatDisplayName(
    matchId: string,
    seatId: string,
    displayName: string,
  ): MatchStoreResult<{ seatId: string; displayName: string }>;
  openHand(
    matchId: string,
    input?: { buttonSeatId?: string; rng?: Rng },
  ): MatchStoreResult<{ matchId: string; currentSeat: string }>;
  appendMove(
    matchId: string,
    seatId: string,
    payload: unknown,
  ): MatchStoreResult<{ seq: number }>;
  getPublicState(matchId: string): MatchStoreResult<PublicMatchState>;
  getSeatView(matchId: string, seatId: string): MatchStoreResult<SeatMatchView>;
  getMoves(matchId: string): MatchStoreResult<MoveLogItem[]>;
  holdWrite(matchId: string): MatchStoreResult<HoldWriteHandle>;
  applyPlayerAction(
    matchId: string,
    seatId: string,
    action: Action,
    expectedOccupant: string,
  ): MatchStoreResult<ApplyPlayerActionResult>;
  advanceStreetIfComplete(
    matchId: string,
  ): MatchStoreResult<AdvanceStreetIfCompleteResult>;
  getSeatLegalActions(
    matchId: string,
    seatId: string,
  ): LegalizedAction[] | undefined;
}

export function createMatchStore(): MatchStore {
  const matches = new Map<string, MatchRecord>();

  function getRecord(matchId: string): MatchRecord | undefined {
    return matches.get(matchId);
  }

  function withWriteLock<T>(
    matchId: string,
    fn: (record: MatchRecord) => MatchStoreResult<T>,
  ): MatchStoreResult<T> {
    const record = getRecord(matchId);
    if (!record) {
      return fail('match_not_found', 404);
    }
    if (record.locked) {
      return fail('illegal_turn', 409);
    }
    record.locked = true;
    try {
      return fn(record);
    } finally {
      record.locked = false;
    }
  }

  function isValidMovePayload(payload: unknown): boolean {
    return (
      isHandOpenPayload(payload) ||
      isActionPayload(payload) ||
      isStreetDealPayload(payload) ||
      isHandCompletePayload(payload)
    );
  }

  return {
    createMatch(input = {}) {
      if (hasClientSuppliedStateKeys(input)) {
        return fail('client_supplied_state', 400);
      }

      const seatCount = input.seatCount ?? 2;
      if (!Number.isInteger(seatCount) || seatCount < 0 || seatCount > 9) {
        return fail('invalid_seat_count', 400);
      }

      const matchId = generateMatchId();
      const seats = Array.from({ length: seatCount }, () => ({
        seatId: generateSeatId(),
        playerSubject: null as string | null,
        displayName: null as string | null,
        stack: MATCH_STARTING_STACK,
      }));

      matches.set(matchId, {
        matchId,
        seats,
        currentSeat: null,
        hiddenViews: new Map(),
        moves: [],
        shoe: null,
        locked: false,
      });

      return { ok: true, value: { matchId } };
    },

    addEmptySeats(matchId, count) {
      return withWriteLock(matchId, (record) => {
        if (!Number.isInteger(count) || count < 1) {
          return fail('invalid_seat_count', 400);
        }
        if (record.seats.length + count > 9) {
          return fail('invalid_seat_count', 400);
        }

        const seatIds: string[] = [];
        for (let i = 0; i < count; i += 1) {
          const seatId = generateSeatId();
          record.seats.push({
            seatId,
            playerSubject: null,
            displayName: null,
            stack: MATCH_STARTING_STACK,
          });
          seatIds.push(seatId);
        }

        return { ok: true, value: { seatIds } };
      });
    },

    setSeatOccupant(matchId, seatId, playerSubject) {
      return withWriteLock(matchId, (record) => {
        const seat = record.seats.find((entry) => entry.seatId === seatId);
        if (!seat) {
          return fail('seat_not_found', 404);
        }

        if (playerSubject !== null) {
          if (seat.playerSubject !== null && seat.playerSubject !== playerSubject) {
            return fail('seat_occupied', 409);
          }

          const alreadyOnOtherSeat = record.seats.find(
            (entry) =>
              entry.seatId !== seatId && entry.playerSubject === playerSubject,
          );
          if (alreadyOnOtherSeat) {
            return fail('already_seated', 409);
          }
        }

        seat.playerSubject = playerSubject;
        return { ok: true, value: { seatId, playerSubject } };
      });
    },

    claimEmptySeat(matchId, playerSubject) {
      return withWriteLock(matchId, (record) => {
        const existingSeat = record.seats.find(
          (entry) => entry.playerSubject === playerSubject,
        );
        if (existingSeat) {
          return {
            ok: true,
            value: { seatId: existingSeat.seatId, created: false },
          };
        }

        const emptySeat = record.seats.find((entry) => entry.playerSubject === null);
        if (!emptySeat) {
          return fail('seat_occupied', 409);
        }

        emptySeat.playerSubject = playerSubject;
        return { ok: true, value: { seatId: emptySeat.seatId, created: true } };
      });
    },

    findSeatForPlayer(matchId, playerSubject) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      const seat = record.seats.find((entry) => entry.playerSubject === playerSubject);
      if (!seat) {
        return fail('not_seated', 403);
      }
      return { ok: true, value: { seatId: seat.seatId } };
    },

    setSeatDisplayName(matchId, seatId, displayName) {
      return withWriteLock(matchId, (record) => {
        const seat = record.seats.find((entry) => entry.seatId === seatId);
        if (!seat) {
          return fail('seat_not_found', 404);
        }

        seat.displayName = displayName;
        return { ok: true, value: { seatId, displayName } };
      });
    },

    openHand(matchId, input = {}) {
      return withWriteLock(matchId, (record) => {
        if (hasClientSuppliedStateKeys(input)) {
          return fail('client_supplied_state', 400);
        }

        if (record.seats.length < 2 || record.seats.length > 9) {
          return fail('not_enough_seats', 400);
        }

        if (hasHandOpen(record.moves)) {
          return fail('hand_already_open', 409);
        }

        const buttonSeatId = input.buttonSeatId ?? record.seats[0]!.seatId;
        if (!record.seats.some((seat) => seat.seatId === buttonSeatId)) {
          return fail('seat_not_found', 404);
        }

        const preBlindStacks = record.seats.map((seat) => ({
          seatId: seat.seatId,
          stack: seat.stack,
        }));

        const dealt = dealHand({
          seats: preBlindStacks,
          buttonSeatId,
          blinds: MATCH_BLINDS,
          rng: input.rng ?? createCryptoRng(),
        });

        if (!dealt.ok) {
          return fail('invalid_deal', 400);
        }

        const hand = dealt.value;

        record.hiddenViews.clear();
        for (const seatState of hand.seats) {
          record.hiddenViews.set(seatState.seatId, {
            hole: [seatState.hole[0], seatState.hole[1]],
          });
        }

        record.shoe = {
          kind: 'dealer_shoe',
          deckRemaining: [...hand.deckRemaining],
          burns: [...hand.burns],
        };

        for (const seatState of hand.seats) {
          const seat = record.seats.find((entry) => entry.seatId === seatState.seatId);
          if (seat) {
            seat.stack = seatState.stack;
          }
        }

        const currentSeat = hand.currentSeatId;
        if (currentSeat === null) {
          return fail('invalid_deal', 400);
        }

        record.currentSeat = currentSeat;

        const payload = buildHandOpenPayload({
          seats: preBlindStacks,
          buttonSeatId,
          blinds: MATCH_BLINDS,
        });

        record.moves.push({
          seq: record.moves.length + 1,
          seatId: currentSeat,
          payload,
          createdAt: new Date().toISOString(),
        });

        return { ok: true, value: { matchId, currentSeat } };
      });
    },

    appendMove(matchId, seatId, payload) {
      return withWriteLock(matchId, (record) => {
        if (!record.seats.some((seat) => seat.seatId === seatId)) {
          return fail('seat_not_found', 404);
        }

        if (!isValidMovePayload(payload)) {
          return fail('invalid_payload', 400);
        }

        const seq = record.moves.length + 1;
        record.moves.push({
          seq,
          seatId,
          payload,
          createdAt: new Date().toISOString(),
        });

        if (isActionPayload(payload)) {
          const handOpen = findLatestHandOpen(record.moves);
          if (handOpen) {
            const holesBySeat = new Map<
              string,
              [import('../rules/types.js').Card, import('../rules/types.js').Card]
            >();
            for (const [id, view] of record.hiddenViews) {
              holesBySeat.set(id, [view.hole[0], view.hole[1]]);
            }
            const reconstructed = reconstructHand({
              handOpen,
              actions: actionsAfterHandOpen(record.moves),
              holesBySeat,
              shoe: record.shoe,
            });
            if (reconstructed.ok) {
              record.currentSeat = reconstructed.value.currentSeatId;
              for (const seatState of reconstructed.value.seats) {
                const seat = record.seats.find((entry) => entry.seatId === seatState.seatId);
                if (seat) {
                  seat.stack = seatState.stack;
                }
              }
            }
          }
        }

        if (isHandCompletePayload(payload)) {
          record.currentSeat = null;
        }

        return { ok: true, value: { seq } };
      });
    },

    getPublicState(matchId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      return { ok: true, value: buildPublicState(record) };
    },

    getSeatView(matchId, seatId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      if (!record.seats.some((seat) => seat.seatId === seatId)) {
        return fail('seat_not_found', 404);
      }

      const publicState = buildPublicState(record);
      const hidden = record.hiddenViews.get(seatId);

      return {
        ok: true,
        value: {
          ...publicState,
          seatId,
          hole: hidden ? ([hidden.hole[0], hidden.hole[1]] as const) : null,
        },
      };
    },

    getMoves(matchId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      return {
        ok: true,
        value: record.moves.map((item) => ({
          ...item,
          payload:
            typeof item.payload === 'object' && item.payload !== null
              ? structuredClone(item.payload)
              : item.payload,
        })),
      };
    },

    holdWrite(matchId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      if (record.locked) {
        return fail('illegal_turn', 409);
      }
      record.locked = true;
      return {
        ok: true,
        value: {
          release: () => {
            record.locked = false;
          },
        },
      };
    },

    applyPlayerAction(matchId, seatId, action, expectedOccupant) {
      return withWriteLock(matchId, (record) => {
        const seat = record.seats.find((entry) => entry.seatId === seatId);
        if (!seat) {
          return fail('seat_not_found', 404);
        }

        if (
          seat.playerSubject === null ||
          seat.playerSubject !== expectedOccupant
        ) {
          return fail('not_occupant', 403);
        }

        const handOpen = findLatestHandOpen(record.moves);
        if (!handOpen) {
          return fail('betting_not_open', 409);
        }

        const holesBySeat = new Map<string, [Card, Card]>();
        for (const [id, view] of record.hiddenViews) {
          holesBySeat.set(id, [view.hole[0], view.hole[1]]);
        }

        if (holesBySeat.size === 0) {
          return fail('holes_not_dealt', 400);
        }

        const reconstructed = reconstructHand({
          handOpen,
          actions: actionsAfterHandOpen(record.moves),
          holesBySeat,
          shoe: record.shoe,
        });

        if (!reconstructed.ok) {
          if (reconstructed.error === 'holes_not_dealt') {
            return fail('holes_not_dealt', 400);
          }
          return fail('reconstruct_failed', 400);
        }

        const legalized = legalize(reconstructed.value, seatId, action);
        if (!legalized.ok) {
          const mapped = mapRulesReject(legalized.error.code);
          if (mapped) {
            return mapped;
          }
        }

        const applied = applyAction(reconstructed.value, seatId, action);
        if (!applied.ok) {
          const mapped = mapRulesReject(applied.error.code);
          if (mapped) {
            return mapped;
          }
        }

        const nextState = applied.value;
        const actionPayload = buildActionPayload(legalized.value);

        const seq = record.moves.length + 1;
        record.moves.push({
          seq,
          seatId,
          payload: actionPayload,
          createdAt: new Date().toISOString(),
        });

        record.currentSeat = nextState.currentSeatId;
        for (const seatState of nextState.seats) {
          const matchSeat = record.seats.find((entry) => entry.seatId === seatState.seatId);
          if (matchSeat) {
            matchSeat.stack = seatState.stack;
          }
        }

        let displayState = nextState;
        if (shouldAdvanceAfterAction(nextState)) {
          const healed = advanceStreetInLock(record);
          if (!healed.ok) {
            return healed;
          }
          if (healed.value.advanced) {
            const afterAdvance = reconstructRecordHand(record);
            if (afterAdvance?.ok) {
              displayState = afterAdvance.value;
            }
          }
        }

        const hidden = record.hiddenViews.get(seatId);
        const legal =
          displayState.phase === 'betting' && displayState.currentSeatId === seatId
            ? legalActions(displayState, seatId)
            : undefined;

        const result: ApplyPlayerActionResult = {
          seatId,
          hole: hidden ? ([hidden.hole[0], hidden.hole[1]] as const) : null,
          currentSeat: displayState.currentSeatId,
          pot: displayState.pot,
          seats: record.seats.map((entry) => ({
            seatId: entry.seatId,
            stack: entry.stack,
          })),
          ...(displayState.board.length >= 3 ? { board: [...displayState.board] } : {}),
          ...(legal && legal.length > 0 ? { legalActions: legal } : {}),
        };

        return { ok: true, value: result };
      });
    },

    advanceStreetIfComplete(matchId) {
      return withWriteLock(matchId, (record) => advanceStreetInLock(record));
    },

    getSeatLegalActions(matchId, seatId) {
      const record = getRecord(matchId);
      if (!record) {
        return undefined;
      }
      const reconstructed = reconstructRecordHand(record);
      if (!reconstructed?.ok) {
        return undefined;
      }
      const state = reconstructed.value;
      if (state.phase !== 'betting' || state.currentSeatId !== seatId) {
        return undefined;
      }
      const legal = legalActions(state, seatId);
      return legal.length > 0 ? legal : undefined;
    },
  };
}
