import type { TurnurClient } from '@turnur/sdk';
import type { Card } from '../../rules/types.js';
import { isCard } from '../table/dto.js';

export type ShoeView = {
  kind: 'dealer_shoe';
  deckRemaining: Card[];
  burns: Card[];
};

export type ShoeResolveResult =
  | { ok: true; shoeSeatId: string }
  | { ok: false; error: 'shoe_missing' | 'shoe_ambiguous' };

export function parseShoeView(value: unknown): ShoeView | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== 'dealer_shoe') {
    return null;
  }
  const deckRemaining = record.deckRemaining;
  const burns = record.burns;
  if (!Array.isArray(deckRemaining) || !Array.isArray(burns)) {
    return null;
  }
  const allCards = [...deckRemaining, ...burns];
  const seen = new Set<string>();
  for (const card of allCards) {
    if (!isCard(card)) {
      return null;
    }
    if (seen.has(card)) {
      return null;
    }
    seen.add(card);
  }
  return {
    kind: 'dealer_shoe',
    deckRemaining: deckRemaining as Card[],
    burns: burns as Card[],
  };
}

export function cloneShoeView(shoe: ShoeView): ShoeView {
  return {
    kind: 'dealer_shoe',
    deckRemaining: [...shoe.deckRemaining],
    burns: [...shoe.burns],
  };
}

export function resolveShoeSeatIdFromExtras(
  rosterSeatIds: string[],
  playerSeatIds: string[],
): ShoeResolveResult {
  const playerSet = new Set(playerSeatIds);
  const extras = rosterSeatIds.filter((seatId) => !playerSet.has(seatId));
  if (extras.length === 0) {
    return { ok: false, error: 'shoe_missing' };
  }
  if (extras.length > 1) {
    return { ok: false, error: 'shoe_ambiguous' };
  }
  return { ok: true, shoeSeatId: extras[0]! };
}

export function resolveShoeSeatId(
  handOpenShoeSeatId: string | undefined,
  rosterSeatIds: string[],
  playerSeatIds: string[],
): ShoeResolveResult {
  if (handOpenShoeSeatId) {
    return { ok: true, shoeSeatId: handOpenShoeSeatId };
  }
  return resolveShoeSeatIdFromExtras(rosterSeatIds, playerSeatIds);
}

export async function loadShoe(
  client: TurnurClient,
  matchId: string,
  shoeSeatId: string,
): Promise<{ ok: true; value: ShoeView } | { ok: false; error: 'invalid_shoe' }> {
  const viewResult = await client.match.view.get(matchId, shoeSeatId);
  if (viewResult.view === null || viewResult.view === undefined) {
    return { ok: false, error: 'invalid_shoe' };
  }
  const parsed = parseShoeView(viewResult.view);
  if (!parsed) {
    return { ok: false, error: 'invalid_shoe' };
  }
  return { ok: true, value: parsed };
}

export async function putShoe(
  client: TurnurClient,
  matchId: string,
  shoeSeatId: string,
  shoe: ShoeView,
): Promise<void> {
  await client.match.view.put(matchId, shoeSeatId, shoe);
}

export function buildShoeView(deckRemaining: Card[], burns: Card[]): ShoeView {
  return { kind: 'dealer_shoe', deckRemaining: [...deckRemaining], burns: [...burns] };
}

type RosterSeat = { seatId: string; createdAt?: string };

export function filterPublicRosterSeats(
  rosterSeats: RosterSeat[],
  handOpen: { seats: { seatId: string }[] } | null,
): RosterSeat[] {
  if (handOpen) {
    const playerIds = new Set(handOpen.seats.map((seat) => seat.seatId));
    return rosterSeats.filter((seat) => playerIds.has(seat.seatId));
  }

  if (rosterSeats.length < 3 || rosterSeats.length > 10) {
    return rosterSeats;
  }

  const sorted = [...rosterSeats].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
  const newest = sorted[0];
  if (!newest) {
    return rosterSeats;
  }
  const remaining = rosterSeats.filter((seat) => seat.seatId !== newest.seatId);
  if (remaining.length >= 2 && remaining.length <= 9) {
    return remaining;
  }
  return rosterSeats;
}
