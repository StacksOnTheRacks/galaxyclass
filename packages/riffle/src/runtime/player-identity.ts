import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { isAvatarId } from '@galaxyclass/accounts/avatars';
import { validateGamerTag } from '@galaxyclass/accounts/gamer-tag';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

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

/**
 * Checks signature (pool JWKS), issuer, token_use=access, client_id, and expiry.
 * ID tokens are rejected so a token minted for another client or purpose cannot seat a player.
 */
export function createAccessTokenVerifier(userPoolId: string, clientId: string) {
  return CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' });
}

/** Reads the public profile the studio owns; Riffle never writes it. */
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
): ResolvePlayer {
  return async (accessToken) => {
    let sub: unknown;
    try {
      ({ sub } = await verifier.verify(accessToken));
    } catch (error) {
      // aws-jwt-verify messages name the failed check (expiry, client_id, token_use); they never echo the token.
      console.warn('[riffle] access token rejected', {
        error: error instanceof Error ? error.name : 'unknown',
        detail: error instanceof Error ? error.message : String(error),
      });
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
): ResolvePlayer | null {
  if (!env.userPoolId || !env.clientId || !env.profileTableName) {
    return null;
  }
  return createPlayerResolver(
    createAccessTokenVerifier(env.userPoolId, env.clientId),
    createProfileLookup(client, env.profileTableName),
  );
}
