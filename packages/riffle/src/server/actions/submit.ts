import type { TurnurClient } from '@turnur/sdk';
import { applyAction, legalActions, legalize } from '../../rules/index.js';
import type { Card, HandState, LegalizedAction } from '../../rules/types.js';
import { requireSeatCapability } from '../seats/capability/gate.js';
import type { SeatCapabilityLedger } from '../seats/capability/ledger.js';
import {
  requireAuthenticatedTurnurClient,
  TurnurAuthenticationError,
} from '../turnur/session.js';
import { mapTableTurnurError } from '../table/errors.js';
import type { SeatTable } from '../table/dto.js';
import { parseHoleView } from '../table/dto.js';
import { loadShoeForHand } from '../table/seat.js';
import { maybeAdvanceStreet } from '../hands/advance.js';
import { maybeCompleteHand } from '../hands/complete.js';
import { buildActionPayload, type MoveLogItem } from '../hands/move-types.js';
import {
  hasHandCompleteInActions,
  hasStreetDealAfterLastAction,
  lastActionSeatId,
} from '../hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  parseActionBody,
  reconstructHand,
  type ReconstructedHand,
} from '../hands/reconstruct.js';

export interface SubmitActionInput {
  matchId: string;
  seatId: string;
  action: unknown;
  capabilityToken: string | undefined;
  attachedMatchId?: string;
  ledger: SeatCapabilityLedger;
}

export interface SubmitActionDeps {
  getClient?: () => Promise<TurnurClient>;
  requireSeatCapabilityFn?: typeof requireSeatCapability;
  legalizeFn?: typeof legalize;
  applyActionFn?: typeof applyAction;
  legalActionsFn?: typeof legalActions;
  advanceStreetFn?: typeof import('../../rules/index.js').advanceStreet;
  completeFoldToOneFn?: typeof import('../../rules/index.js').completeFoldToOne;
  showdownFn?: typeof import('../../rules/index.js').showdown;
}

export type SubmitActionError =
  | { kind: 'capability'; code: string }
  | { kind: 'turnur_unauthenticated'; reason: string }
  | { kind: 'turnur'; response: Response }
  | { kind: 'betting_not_open'; response: Response }
  | { kind: 'holes_not_dealt' }
  | { kind: 'invalid_view'; response: Response }
  | { kind: 'reconstruct_failed'; response: Response }
  | { kind: 'off_turn'; response: Response }
  | { kind: 'illegal_action'; response: Response }
  | { kind: 'all_in_or_side_pot_unsupported'; response: Response }
  | { kind: 'already_complete'; response: Response }
  | { kind: 'illegal_turn'; response: Response }
  | { kind: 'street_not_complete'; response: Response }
  | { kind: 'cannot_advance'; response: Response }
  | { kind: 'advance_failed'; response: Response }
  | { kind: 'hand_not_ready'; response: Response }
  | { kind: 'complete_failed'; response: Response };

function isTurnur409(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string; status?: number }).name === 'TurnurApiError' &&
    (error as { status?: number }).status === 409
  );
}

function mapRulesReject(code: string): SubmitActionError | null {
  switch (code) {
    case 'off_turn':
      return {
        kind: 'off_turn',
        response: Response.json({ error: 'off_turn' }, { status: 409 }),
      };
    case 'illegal_action':
      return {
        kind: 'illegal_action',
        response: Response.json({ error: 'illegal_action' }, { status: 400 }),
      };
    case 'all_in_or_side_pot_unsupported':
      return {
        kind: 'all_in_or_side_pot_unsupported',
        response: Response.json({ error: 'all_in_or_side_pot_unsupported' }, { status: 400 }),
      };
    case 'already_complete':
      return {
        kind: 'already_complete',
        response: Response.json({ error: 'already_complete' }, { status: 409 }),
      };
    default:
      return {
        kind: 'illegal_action',
        response: Response.json({ error: 'illegal_action' }, { status: 400 }),
      };
  }
}

async function loadAllHoles(
  client: TurnurClient,
  matchId: string,
  seatIds: string[],
): Promise<
  | { ok: true; value: Map<string, [Card, Card]> }
  | { ok: false; error: 'holes_not_dealt' | 'invalid_view'; response?: Response }
> {
  const holesBySeat = new Map<string, [Card, Card]>();

  for (const seatId of seatIds) {
    let viewResult;
    try {
      viewResult = await client.match.view.get(matchId, seatId);
    } catch (error) {
      return { ok: false, error: 'invalid_view', response: mapTableTurnurError(error, 'seat') };
    }

    if (viewResult.view === null || viewResult.view === undefined) {
      return { ok: false, error: 'holes_not_dealt' };
    }

    const parsed = parseHoleView(viewResult.view);
    if (!parsed) {
      return { ok: false, error: 'invalid_view' };
    }
    holesBySeat.set(seatId, parsed.hole);
  }

  return { ok: true, value: holesBySeat };
}

function projectSeatTable(
  matchId: string,
  seatId: string,
  state: ReconstructedHand,
  hole: [Card, Card] | null,
  legalActionsList?: LegalizedAction[],
): SeatTable {
  const table: SeatTable = {
    matchId,
    seats: state.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    currentSeat: state.currentSeatId,
    pot: state.pot,
    seatId,
    hole,
  };

  if (state.board.length >= 3) {
    table.board = [...state.board];
  }

  if (state.phase === 'complete') {
    if (state.completeReason) {
      table.completeReason = state.completeReason;
    }
    if (state.winners) {
      table.winners = state.winners.map((winner) => ({
        seatId: winner.seatId,
        amount: winner.amount,
      }));
    }
    if (state.shownHolesFacts && state.shownHolesFacts.length > 0) {
      table.shownHoles = state.shownHolesFacts.map((shown) => ({
        seatId: shown.seatId,
        hole: [shown.hole[0], shown.hole[1]],
      }));
    }
  }

  if (legalActionsList && legalActionsList.length > 0) {
    table.legalActions = legalActionsList;
  }

  return table;
}

function shouldHealComplete(state: HandState, actions: MoveLogItem[]): boolean {
  if (state.phase !== 'fold_to_one' && state.phase !== 'showdown_ready') {
    return false;
  }
  return !hasHandCompleteInActions(actions);
}

function completeReasonForPhase(phase: HandState['phase']): 'fold_to_one' | 'showdown' | null {
  if (phase === 'fold_to_one') {
    return 'fold_to_one';
  }
  if (phase === 'showdown_ready') {
    return 'showdown';
  }
  return null;
}

async function runCompleteHeal(
  client: TurnurClient,
  matchId: string,
  handOpen: NonNullable<ReturnType<typeof findLatestHandOpen>>,
  items: MoveLogItem[],
  healSeatId: string,
  deps: SubmitActionDeps,
): Promise<
  | { ok: true; value: { state: ReconstructedHand; holes: Map<string, [Card, Card]>; actions: MoveLogItem[] } }
  | { ok: false; error: SubmitActionError }
> {
  const loaded = await reloadHandState(client, matchId, handOpen, items);
  if (!loaded.ok) {
    return loaded;
  }

  const reason = completeReasonForPhase(loaded.value.state.phase);
  if (!reason) {
    return loaded;
  }

  const completed = await maybeCompleteHand({
    matchId,
    pathSeatId: healSeatId,
    state: loaded.value.state,
    reason,
    client,
    deps: {
      completeFoldToOneFn: deps.completeFoldToOneFn,
      showdownFn: deps.showdownFn,
    },
  });

  if (!completed.ok) {
    const err = completed.error;
    if (err.kind === 'hand_not_ready') {
      return { ok: false, error: { kind: 'hand_not_ready', response: err.response } };
    }
    if (err.kind === 'all_in_or_side_pot_unsupported') {
      return {
        ok: false,
        error: { kind: 'all_in_or_side_pot_unsupported', response: err.response },
      };
    }
    if (err.kind === 'complete_failed') {
      return { ok: false, error: { kind: 'complete_failed', response: err.response } };
    }
    if (err.kind === 'already_complete') {
      return { ok: false, error: { kind: 'already_complete', response: err.response } };
    }
    if (err.kind === 'illegal_turn') {
      return { ok: false, error: { kind: 'illegal_turn', response: err.response } };
    }
    return { ok: false, error: { kind: 'turnur', response: err.response } };
  }

  const refreshedMoves = await client.match.moves.list(matchId);
  return reloadHandState(client, matchId, handOpen, refreshedMoves.items as MoveLogItem[]);
}

function shouldAdvanceAfterAction(state: HandState): boolean {
  return (
    state.phase === 'street_complete' &&
    (state.street === 'preflop' || state.street === 'flop' || state.street === 'turn')
  );
}

function shouldHealStreet(state: HandState, actions: MoveLogItem[]): boolean {
  if (!shouldAdvanceAfterAction(state)) {
    return false;
  }
  return !hasStreetDealAfterLastAction(actions);
}

async function reloadHandState(
  client: TurnurClient,
  matchId: string,
  handOpen: NonNullable<ReturnType<typeof findLatestHandOpen>>,
  items: MoveLogItem[],
): Promise<
  | { ok: true; value: { state: ReconstructedHand; holes: Map<string, [Card, Card]>; actions: MoveLogItem[] } }
  | { ok: false; error: SubmitActionError }
> {
  const holes = await loadAllHoles(
    client,
    matchId,
    handOpen.seats.map((seat) => seat.seatId),
  );
  if (!holes.ok) {
    if (holes.error === 'holes_not_dealt') {
      return { ok: false, error: { kind: 'holes_not_dealt' } };
    }
    return {
      ok: false,
      error: {
        kind: 'invalid_view',
        response: holes.response ?? Response.json({ error: 'invalid_view' }, { status: 502 }),
      },
    };
  }

  const roster = await client.match.seat.list(matchId);
  const shoe = await loadShoeForHand(
    client,
    matchId,
    handOpen,
    roster.seats.map((seat) => seat.seatId),
  );
  if (!shoe.ok) {
    return {
      ok: false,
      error: {
        kind: 'reconstruct_failed',
        response: Response.json({ error: 'reconstruct_failed' }, { status: 502 }),
      },
    };
  }

  const actions = actionsAfterHandOpen(items);
  const reconstructed = reconstructHand({
    handOpen,
    actions,
    holesBySeat: holes.value,
    shoe: shoe.value,
  });
  if (!reconstructed.ok) {
    return {
      ok: false,
      error: {
        kind: 'reconstruct_failed',
        response: Response.json({ error: 'reconstruct_failed' }, { status: 502 }),
      },
    };
  }

  return {
    ok: true,
    value: { state: reconstructed.value, holes: holes.value, actions },
  };
}

export async function submitAction(
  input: SubmitActionInput,
  deps: SubmitActionDeps = {},
): Promise<
  | { ok: true; value: SeatTable }
  | { ok: false; error: SubmitActionError }
> {
  const gate = deps.requireSeatCapabilityFn ?? requireSeatCapability;
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const legalizeFn = deps.legalizeFn ?? legalize;
  const applyActionFn = deps.applyActionFn ?? applyAction;
  const legalActionsFn = deps.legalActionsFn ?? legalActions;

  try {
    gate({
      matchId: input.matchId,
      seatId: input.seatId,
      token: input.capabilityToken,
      attachedMatchId: input.attachedMatchId,
      ledger: input.ledger,
    });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'missing_capability';
    return { ok: false, error: { kind: 'capability', code } };
  }

  const action = parseActionBody(input.action);
  if (!action) {
    return {
      ok: false,
      error: {
        kind: 'illegal_action',
        response: Response.json({ error: 'illegal_action' }, { status: 400 }),
      },
    };
  }

  let client: TurnurClient;
  try {
    client = await getClient();
  } catch (error) {
    if (error instanceof TurnurAuthenticationError) {
      return {
        ok: false,
        error: { kind: 'turnur_unauthenticated', reason: error.reason },
      };
    }
    throw error;
  }

  let movesList;
  try {
    movesList = await client.match.moves.list(input.matchId);
  } catch (error) {
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  const items = movesList.items as MoveLogItem[];
  const handOpen = findLatestHandOpen(items);
  if (!handOpen) {
    return {
      ok: false,
      error: {
        kind: 'betting_not_open',
        response: Response.json({ error: 'betting_not_open' }, { status: 409 }),
      },
    };
  }

  let loaded = await reloadHandState(client, input.matchId, handOpen, items);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }

  let { state: reconstructedState, holes, actions } = loaded.value;

  if (shouldHealStreet(reconstructedState, actions)) {
    const healSeatId = lastActionSeatId(actions) ?? input.seatId;
    const healed = await maybeAdvanceStreet({
      matchId: input.matchId,
      pathSeatId: healSeatId,
      state: reconstructedState,
      client,
      deps: { advanceStreetFn: deps.advanceStreetFn },
    });
    if (!healed.ok) {
      const err = healed.error;
      if (err.kind === 'street_not_complete') {
        return { ok: false, error: { kind: 'street_not_complete', response: err.response } };
      }
      if (err.kind === 'cannot_advance') {
        return { ok: false, error: { kind: 'cannot_advance', response: err.response } };
      }
      if (err.kind === 'all_in_or_side_pot_unsupported') {
        return {
          ok: false,
          error: { kind: 'all_in_or_side_pot_unsupported', response: err.response },
        };
      }
      if (err.kind === 'advance_failed') {
        return { ok: false, error: { kind: 'advance_failed', response: err.response } };
      }
      if (err.kind === 'illegal_turn') {
        return { ok: false, error: { kind: 'illegal_turn', response: err.response } };
      }
      return { ok: false, error: { kind: 'turnur', response: err.response } };
    }

    const refreshedMoves = await client.match.moves.list(input.matchId);
    loaded = await reloadHandState(
      client,
      input.matchId,
      handOpen,
      refreshedMoves.items as MoveLogItem[],
    );
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }
    reconstructedState = loaded.value.state;
    holes = loaded.value.holes;
    actions = loaded.value.actions;
  }

  if (shouldHealComplete(reconstructedState, actions)) {
    const healSeatId = lastActionSeatId(actions) ?? input.seatId;
    const healedComplete = await runCompleteHeal(
      client,
      input.matchId,
      handOpen,
      items,
      healSeatId,
      deps,
    );
    if (!healedComplete.ok) {
      return { ok: false, error: healedComplete.error };
    }
    reconstructedState = healedComplete.value.state;
    holes = healedComplete.value.holes;
    actions = healedComplete.value.actions;
  }

  if (reconstructedState.phase === 'complete') {
    return {
      ok: false,
      error: {
        kind: 'already_complete',
        response: Response.json({ error: 'already_complete' }, { status: 409 }),
      },
    };
  }

  const legalized = legalizeFn(reconstructedState, input.seatId, action);
  if (!legalized.ok) {
    const mapped = mapRulesReject(legalized.error.code);
    if (mapped) {
      return { ok: false, error: mapped };
    }
  }

  const nextStateResult = applyActionFn(reconstructedState, input.seatId, action);
  if (!nextStateResult.ok) {
    const mapped = mapRulesReject(nextStateResult.error.code);
    if (mapped) {
      return { ok: false, error: mapped };
    }
  }

  const actionPayload = buildActionPayload(action);

  try {
    await client.match.move.create(input.matchId, {
      seatId: input.seatId,
      payload: actionPayload,
    });
  } catch (error) {
    if (isTurnur409(error)) {
      await client.match.moves.list(input.matchId);
      await client.match.turn.get(input.matchId);
      return {
        ok: false,
        error: {
          kind: 'illegal_turn',
          response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
        },
      };
    }
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  let nextState = nextStateResult.value;

  if (shouldAdvanceAfterAction(nextState)) {
    const advanced = await maybeAdvanceStreet({
      matchId: input.matchId,
      pathSeatId: input.seatId,
      state: nextState,
      client,
      deps: { advanceStreetFn: deps.advanceStreetFn },
    });
    if (!advanced.ok) {
      const err = advanced.error;
      if (err.kind === 'illegal_turn') {
        return { ok: false, error: { kind: 'illegal_turn', response: err.response } };
      }
      if (err.kind === 'all_in_or_side_pot_unsupported') {
        return {
          ok: false,
          error: { kind: 'all_in_or_side_pot_unsupported', response: err.response },
        };
      }
      if (err.kind === 'street_not_complete') {
        return { ok: false, error: { kind: 'street_not_complete', response: err.response } };
      }
      if (err.kind === 'cannot_advance') {
        return { ok: false, error: { kind: 'cannot_advance', response: err.response } };
      }
      if (err.kind === 'advance_failed') {
        return { ok: false, error: { kind: 'advance_failed', response: err.response } };
      }
      return { ok: false, error: { kind: 'turnur', response: err.response } };
    }
    nextState = advanced.value;
  } else if (nextState.phase === 'fold_to_one' || nextState.phase === 'showdown_ready') {
    const reason = completeReasonForPhase(nextState.phase);
    if (!reason) {
      return {
        ok: false,
        error: {
          kind: 'complete_failed',
          response: Response.json({ error: 'complete_failed' }, { status: 502 }),
        },
      };
    }
    const completed = await maybeCompleteHand({
      matchId: input.matchId,
      pathSeatId: input.seatId,
      state: nextState,
      reason,
      client,
      deps: {
        completeFoldToOneFn: deps.completeFoldToOneFn,
        showdownFn: deps.showdownFn,
      },
    });
    if (!completed.ok) {
      const err = completed.error;
      if (err.kind === 'hand_not_ready') {
        return { ok: false, error: { kind: 'hand_not_ready', response: err.response } };
      }
      if (err.kind === 'all_in_or_side_pot_unsupported') {
        return {
          ok: false,
          error: { kind: 'all_in_or_side_pot_unsupported', response: err.response },
        };
      }
      if (err.kind === 'complete_failed') {
        return { ok: false, error: { kind: 'complete_failed', response: err.response } };
      }
      if (err.kind === 'already_complete') {
        return { ok: false, error: { kind: 'already_complete', response: err.response } };
      }
      if (err.kind === 'illegal_turn') {
        return { ok: false, error: { kind: 'illegal_turn', response: err.response } };
      }
      return { ok: false, error: { kind: 'turnur', response: err.response } };
    }

    const refreshedMoves = await client.match.moves.list(input.matchId);
    loaded = await reloadHandState(
      client,
      input.matchId,
      handOpen,
      refreshedMoves.items as MoveLogItem[],
    );
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }
    nextState = loaded.value.state;
  } else if (
    nextState.phase === 'betting' &&
    nextState.currentSeatId !== null
  ) {
    try {
      await client.match.turn.set(input.matchId, nextState.currentSeatId);
    } catch (error) {
      if (isTurnur409(error)) {
        await client.match.moves.list(input.matchId);
        await client.match.turn.get(input.matchId);
        return {
          ok: false,
          error: {
            kind: 'illegal_turn',
            response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
          },
        };
      }
      return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
    }
  }

  const ownHole = holes.get(input.seatId) ?? null;
  const legal =
    nextState.phase === 'betting' && nextState.currentSeatId === input.seatId
      ? legalActionsFn(nextState, input.seatId)
      : undefined;

  return {
    ok: true,
    value: projectSeatTable(input.matchId, input.seatId, nextState, ownHole, legal),
  };
}
