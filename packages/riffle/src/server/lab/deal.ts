import { dealHandForMatch, type DealHandDeps, type DealHandError } from '../hands/deal.js';
import { openBetting, type OpenBettingDeps, type OpenBettingError } from '../hands/open.js';
import { validateMatchId } from '../seats/validate.js';
import type { LabSessionEntry, LabSessionStore } from './session-store.js';

export const LAB_STARTING_STACK = 10_000;
export const LAB_BLINDS = { smallBlind: 50, bigBlind: 100 };

export type LabDealDeps = DealHandDeps & OpenBettingDeps;

function buildDealInput(session: LabSessionEntry) {
  return {
    matchId: session.matchId,
    seats: session.seatIds.map((seatId) => ({ seatId, stack: LAB_STARTING_STACK })),
    buttonSeatId: session.seatIds[0],
    blinds: LAB_BLINDS,
  };
}

function mapDealError(error: DealHandError): Response {
  switch (error.kind) {
    case 'turnur_unauthenticated':
      return Response.json(
        { error: 'turnur_unauthenticated', reason: error.reason },
        { status: 503 },
      );
    case 'turnur':
      return error.response;
    case 'unknown_seat_id':
      return Response.json({ error: 'unknown_seat_id' }, { status: 400 });
    case 'all_in_or_side_pot_unsupported':
      return Response.json({ error: 'all_in_or_side_pot_unsupported' }, { status: 400 });
    case 'invalid_deal':
      return Response.json({ error: 'invalid_deal' }, { status: 400 });
    case 'shoe_ambiguous':
      return error.response;
  }
}

function mapOpenError(error: OpenBettingError): Response {
  switch (error.kind) {
    case 'turnur_unauthenticated':
      return Response.json(
        { error: 'turnur_unauthenticated', reason: error.reason },
        { status: 503 },
      );
    case 'turnur':
      return error.response;
    case 'unknown_seat_id':
      return Response.json({ error: 'unknown_seat_id' }, { status: 400 });
    case 'invalid_deal':
      return Response.json({ error: 'invalid_deal' }, { status: 400 });
    case 'holes_not_dealt':
      return Response.json({ error: 'holes_not_dealt' }, { status: 400 });
    case 'invalid_view':
      return error.response;
    case 'betting_already_open':
      return error.response;
    case 'illegal_turn':
      return error.response;
    case 'shoe_missing':
      return error.response;
    case 'shoe_ambiguous':
      return error.response;
  }
}

export function parseLabDealMatchId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  return validateMatchId((body as { matchId?: unknown }).matchId);
}

export async function dealLabHandOrError(
  matchId: string,
  sessionStore: LabSessionStore,
  deps: LabDealDeps = {},
): Promise<{ matchId: string; currentSeat: string } | Response> {
  const session = sessionStore.get(matchId);
  if (!session) {
    return Response.json({ error: 'lab_session_unknown' }, { status: 404 });
  }

  if (session.dealOpened) {
    return Response.json({ error: 'betting_already_open' }, { status: 409 });
  }

  const input = buildDealInput(session);
  const dealResult = await dealHandForMatch(input, deps);
  if (!dealResult.ok) {
    return mapDealError(dealResult.error);
  }

  const openResult = await openBetting(input, deps);
  if (!openResult.ok) {
    return mapOpenError(openResult.error);
  }

  sessionStore.markDealOpened(matchId);
  return openResult.value;
}
