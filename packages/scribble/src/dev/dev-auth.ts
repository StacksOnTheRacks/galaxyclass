import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createAccessTokenVerifier, createPlayerResolver, type ResolvePlayer } from '@galaxyclass/accounts/player-verifier';

/**
 * A stand-in Cognito pool for local play. The dev server signs access tokens with a key made
 * at startup and verifies them with the same `aws-jwt-verify` path the Lambda uses, so the
 * signed-in sit flow runs for real. Nothing here ships to the deployed runtime.
 */
const USER_POOL_ID = 'us-east-1_ScribbleDev1';
const CLIENT_ID = 'scribbledevclient000000001';
const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${USER_POOL_ID}`;
const KID = 'scribble-dev';

export const DEV_PROFILES: Record<string, { gamerTag: string; avatarId: number }> = {
  'dev-word-smith': { gamerTag: 'WordSmith', avatarId: 12 },
  'dev-quill-driver': { gamerTag: 'QuillDriver', avatarId: 40 },
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signDevAccessToken(sub: string): string | null {
  if (!(sub in DEV_PROFILES)) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: 'access',
    scope: 'aws.cognito.signin.user.admin',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    jti: randomUUID(),
    username: sub,
  };
  const input = `${b64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64url(payload)}`;
  return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
}

export function devPlayerResolver(): ResolvePlayer {
  const verifier = createAccessTokenVerifier(USER_POOL_ID, CLIENT_ID);
  verifier.cacheJwks({ keys: [publicJwk as never] });
  return createPlayerResolver(
    verifier,
    async (sub) => DEV_PROFILES[sub] ?? { gamerTag: null, avatarId: null },
    { logTag: 'scribble-dev' },
  );
}
