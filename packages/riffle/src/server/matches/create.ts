import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';

export interface CreateMatchDeps {
  getClient?: () => Promise<TurnurClient>;
}

export async function createMatch(deps: CreateMatchDeps = {}) {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();
  return client.match.create();
}
