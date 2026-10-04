export {
  createAccessTokenVerifier,
  createProfileLookup,
  type AccessTokenVerifier,
  type DocumentClientLike,
  type PlayerAuthEnv,
  type PublicProfileLookup,
  type ResolvePlayer,
  type SitIdentity,
  type VerifiedPlayer,
} from '@galaxyclass/accounts/player-verifier';
import {
  createPlayerResolver as createAccountsPlayerResolver,
  playerResolverFromEnv as accountsPlayerResolverFromEnv,
  resolveSitIdentity as accountsResolveSitIdentity,
  type AccessTokenVerifier,
  type DocumentClientLike,
  type PlayerAuthEnv,
  type PublicProfileLookup,
  type ResolvePlayer,
  type SitIdentity,
} from '@galaxyclass/accounts/player-verifier';

const LOG = { logTag: 'riffle' };

export function createPlayerResolver(
  verifier: AccessTokenVerifier,
  lookupProfile: PublicProfileLookup,
): ResolvePlayer {
  return createAccountsPlayerResolver(verifier, lookupProfile, LOG);
}

export function playerResolverFromEnv(env: PlayerAuthEnv, client: DocumentClientLike): ResolvePlayer | null {
  return accountsPlayerResolverFromEnv(env, client, LOG);
}

export function resolveSitIdentity(
  accessToken: unknown,
  resolvePlayer: ResolvePlayer | null | undefined,
): Promise<SitIdentity> {
  return accountsResolveSitIdentity(accessToken, resolvePlayer, LOG);
}
