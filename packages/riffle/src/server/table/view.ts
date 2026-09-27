import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import { parseHoleView, type SeatViewResponse } from './dto.js';

export interface SeatViewInput {
  matchId: string;
  seatId: string;
}

export interface SeatViewDeps {
  getClient?: () => Promise<TurnurClient>;
}

export async function getSeatView(
  input: SeatViewInput,
  deps: SeatViewDeps = {},
): Promise<SeatViewResponse> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();
  const result = await client.match.view.get(input.matchId, input.seatId);

  if (result.view === null || result.view === undefined) {
    return { seatId: input.seatId, view: null };
  }

  const parsed = parseHoleView(result.view);
  if (!parsed) {
    throw new InvalidViewError();
  }

  return { seatId: input.seatId, view: parsed };
}

export class InvalidViewError extends Error {
  constructor() {
    super('invalid_view');
    this.name = 'InvalidViewError';
  }
}
