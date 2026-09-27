import type { IdentityStore } from '../identity/store.js';
import { parseIdentityBearer } from '../server/identity/bearer.js';
import type { RiffleEnv } from '../server/env.js';
import { isValidSeatCapabilityTokenFormat } from '../server/seats/capability/token.js';

export type VerifiedPlayBearer = {
  playerSubject: string;
};

export type VerifyPlayBearer = (token: string) => VerifiedPlayBearer | undefined;

export function createVerifyPlayBearer(
  identityStore: IdentityStore,
  env: RiffleEnv,
): VerifyPlayBearer {
  return (token: string) => verifyPlayBearerToken(token, env, identityStore.getSession.bind(identityStore));
}

export function verifyPlayBearerToken(
  token: string,
  env: RiffleEnv,
  getSession: (bearer: string) => { playerSubject: string } | undefined,
): VerifiedPlayBearer | undefined {
  const parsed = parseIdentityBearer(`Bearer ${token}`, env);
  if (!parsed) {
    return undefined;
  }
  if (isValidSeatCapabilityTokenFormat(parsed)) {
    return undefined;
  }
  const session = getSession(parsed);
  if (!session) {
    return undefined;
  }
  return { playerSubject: session.playerSubject };
}

export function parseAuthorizationField(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
    return undefined;
  }
  const token = value.slice('Bearer '.length).trim();
  return token || undefined;
}

export function tokenAppearsInWebSocketProtocol(header: string | undefined): boolean {
  if (!header) {
    return false;
  }
  return header
    .split(',')
    .map((part) => part.trim())
    .some((part) => part.length > 0);
}
