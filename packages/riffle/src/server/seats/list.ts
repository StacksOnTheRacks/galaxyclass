import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import { rosterSeatOnly } from './validate.js';

export interface ListSeatsInput {
  matchId: string;
}

export interface ListSeatsDeps {
  getClient?: () => Promise<TurnurClient>;
}

export async function listSeats(input: ListSeatsInput, deps: ListSeatsDeps = {}) {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();
  const result = await client.match.seat.list(input.matchId);
  return {
    seats: result.seats.map((seat) =>
      rosterSeatOnly<{ seatId: string; createdAt: string }>(
        seat as unknown as Record<string, unknown>,
      ),
    ),
    currentSeat: result.currentSeat,
  };
}
