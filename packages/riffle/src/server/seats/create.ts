import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';

export interface CreateSeatInput {
  matchId: string;
}

export interface CreateSeatDeps {
  getClient?: () => Promise<TurnurClient>;
}

export async function createSeat(input: CreateSeatInput, deps: CreateSeatDeps = {}) {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();
  return client.match.seat.create(input.matchId);
}
