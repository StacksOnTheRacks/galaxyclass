import {
  createTurnurClient,
  TurnurApiError,
  type TurnurClient,
} from '@turnur/sdk';

export type TurnurUnauthenticatedReason =
  | 'missing_key'
  | 'missing_config'
  | 'invalid_key'
  | 'probe_failed';

export type TurnurSession =
  | { status: 'authenticated'; client: TurnurClient; gameId: string }
  | { status: 'unauthenticated'; reason: TurnurUnauthenticatedReason };

export class TurnurAuthenticationError extends Error {
  readonly reason: TurnurUnauthenticatedReason;

  constructor(reason: TurnurUnauthenticatedReason) {
    super(`Turnur session not authenticated: ${reason}`);
    this.name = 'TurnurAuthenticationError';
    this.reason = reason;
  }
}

export interface TurnurSessionDeps {
  createClient?: typeof createTurnurClient;
  baseUrl?: string;
  apiKey?: string;
}

let cachedSession: TurnurSession | undefined;
let authenticationPromise: Promise<TurnurSession> | undefined;

function readTurnurConfig(deps?: TurnurSessionDeps):
  | { baseUrl: string; apiKey: string }
  | { reason: TurnurUnauthenticatedReason } {
  const baseUrl = (deps?.baseUrl ?? process.env.TURNUR_BASE_URL ?? '').trim();
  const apiKey = (deps?.apiKey ?? process.env.TURNUR_SDK_KEY ?? '').trim();

  if (!baseUrl) {
    return { reason: 'missing_config' };
  }
  if (!apiKey) {
    return { reason: 'missing_key' };
  }

  return { baseUrl, apiKey };
}

function logAuthenticationSuccess(gameId: string): void {
  console.info('[turnur] authenticated', { status: 'authenticated', gameId });
}

function logAuthenticationFailure(reason: TurnurUnauthenticatedReason): void {
  console.warn('[turnur] authentication failed', { status: 'unauthenticated', reason });
}

async function probeTurnurSession(deps?: TurnurSessionDeps): Promise<TurnurSession> {
  const config = readTurnurConfig(deps);
  if ('reason' in config) {
    const session: TurnurSession = { status: 'unauthenticated', reason: config.reason };
    cachedSession = session;
    logAuthenticationFailure(config.reason);
    return session;
  }

  const createClient = deps?.createClient ?? createTurnurClient;
  const client = createClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });

  try {
    const { gameId } = await client.game.me();
    const session: TurnurSession = { status: 'authenticated', client, gameId };
    cachedSession = session;
    logAuthenticationSuccess(gameId);
    return session;
  } catch (error) {
    const reason: TurnurUnauthenticatedReason =
      error instanceof TurnurApiError && error.status === 401
        ? 'invalid_key'
        : 'probe_failed';
    const session: TurnurSession = { status: 'unauthenticated', reason };
    cachedSession = session;
    logAuthenticationFailure(reason);
    return session;
  }
}

export async function authenticateTurnurSession(
  deps?: TurnurSessionDeps,
): Promise<TurnurSession> {
  if (cachedSession) {
    return cachedSession;
  }

  if (!authenticationPromise) {
    authenticationPromise = probeTurnurSession(deps).finally(() => {
      authenticationPromise = undefined;
    });
  }

  return authenticationPromise;
}

export function getTurnurSession(): TurnurSession | undefined {
  return cachedSession;
}

export async function requireAuthenticatedTurnurClient(
  deps?: TurnurSessionDeps,
): Promise<TurnurClient> {
  const session = cachedSession ?? (await authenticateTurnurSession(deps));
  if (session.status === 'unauthenticated') {
    throw new TurnurAuthenticationError(session.reason);
  }
  return session.client;
}

export function resetTurnurSession(): void {
  cachedSession = undefined;
  authenticationPromise = undefined;
}
