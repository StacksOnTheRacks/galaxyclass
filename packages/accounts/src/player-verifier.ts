import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { isAvatarId } from './avatars.js';
import { validateGamerTag } from './gamer-tag.js';

/** A Galaxy Class account proven by a verified Cognito access token. */
export interface VerifiedPlayer {
  sub: string;
  gamerTag: string | null;
  avatarId: number | null;
}

/** Resolves an access token to its account, or null when the token does not verify. */
export type ResolvePlayer = (accessToken: string) => Promise<VerifiedPlayer | null>;

export interface AccessTokenVerifier {
  verify(token: string): Promise<{ sub?: unknown }>;
}

export interface PublicProfileLookup {
  (sub: string): Promise<{ gamerTag: string | null; avatarId: number | null }>;
}

export interface DocumentClientLike {
  send(command: unknown): Promise<unknown>;
}

export interface PlayerAuthEnv {
  userPoolId?: string;
  clientId?: string;
  profileTableName?: string;
}

export interface VerifierLogOptions {
  /** Prefix for log lines, e.g. `riffle` → `[riffle] access token rejected`. */
  logTag?: string;
}

/**
 * Checks signature (pool JWKS), issuer, token_use=access, client_id, and expiry.
 * ID tokens are rejected so a token minted for another client or purpose cannot seat a player.
 */
export function createAccessTokenVerifier(userPoolId: string, clientId: string) {
  return CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' });
}

/** Reads the public profile the studio owns; games never write it. */
export function createProfileLookup(client: DocumentClientLike, tableName: string): PublicProfileLookup {
  return async (sub) => {
    const result = (await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}` },
        ProjectionExpression: 'gamerTag, avatarId',
        ConsistentRead: true,
      }),
    )) as { Item?: { gamerTag?: unknown; avatarId?: unknown } };
    const tag = validateGamerTag(result.Item?.gamerTag);
    return {
      gamerTag: tag.ok ? tag.value : null,
      avatarId: isAvatarId(result.Item?.avatarId) ? result.Item.avatarId : null,
    };
  };
}

export function createPlayerResolver(
  verifier: AccessTokenVerifier,
  lookupProfile: PublicProfileLookup,
  options: VerifierLogOptions = {},
): ResolvePlayer {
  const tag = options.logTag ?? 'accounts';
  return async (accessToken) => {
    let sub: unknown;
    try {
      ({ sub } = await verifier.verify(accessToken));
    } catch (error) {
      // aws-jwt-verify messages name the failed check (expiry, client_id, token_use); they never echo the token.
      console.warn(`[${tag}] access token rejected`, describeError(error));
      return null;
    }
    if (typeof sub !== 'string' || sub === '') {
      return null;
    }
    const profile = await lookupProfile(sub);
    return { sub, ...profile };
  };
}

/** Null when the runtime is not wired to Cognito; every sit is then a guest sit. */
export function playerResolverFromEnv(
  env: PlayerAuthEnv,
  client: DocumentClientLike,
  options: VerifierLogOptions = {},
): ResolvePlayer | null {
  if (!env.userPoolId || !env.clientId || !env.profileTableName) {
    return null;
  }
  return createPlayerResolver(
    createAccessTokenVerifier(env.userPoolId, env.clientId),
    createProfileLookup(client, env.profileTableName),
    options,
  );
}

export type SitIdentity =
  | { ok: true; player: VerifiedPlayer | null }
  | { ok: false; code: 'invalid_access_token' | 'identity_unavailable' };

/**
 * No token is a guest sit. A supplied token must verify; it never silently becomes a guest sit.
 */
export async function resolveSitIdentity(
  accessToken: unknown,
  resolvePlayer: ResolvePlayer | null | undefined,
  options: VerifierLogOptions = {},
): Promise<SitIdentity> {
  const tag = options.logTag ?? 'accounts';
  if (accessToken === undefined) {
    console.info(`[${tag}] sit identity`, { outcome: 'guest_no_token' });
    return { ok: true, player: null };
  }
  if (typeof accessToken !== 'string' || !accessToken || !resolvePlayer) {
    console.warn(`[${tag}] sit identity`, {
      outcome: 'rejected',
      reason: resolvePlayer ? 'malformed_token' : 'resolver_not_configured',
    });
    return { ok: false, code: 'invalid_access_token' };
  }
  try {
    const player = await resolvePlayer(accessToken);
    if (!player) {
      console.warn(`[${tag}] sit identity`, { outcome: 'rejected', reason: 'token_did_not_verify' });
      return { ok: false, code: 'invalid_access_token' };
    }
    console.info(`[${tag}] sit identity`, {
      outcome: 'verified',
      hasGamerTag: player.gamerTag !== null,
      hasAvatar: player.avatarId !== null,
    });
    return { ok: true, player };
  } catch (error) {
    console.error(`[${tag}] sit identity`, { outcome: 'unavailable', ...describeError(error) });
    return { ok: false, code: 'identity_unavailable' };
  }
}

function describeError(error: unknown): { error: string; detail: string } {
  return error instanceof Error
    ? { error: error.name, detail: error.message }
    : { error: 'unknown', detail: String(error) };
}
