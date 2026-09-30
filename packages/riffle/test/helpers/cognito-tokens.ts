import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createAccessTokenVerifier } from '../../src/runtime/player-identity.js';

export const USER_POOL_ID = 'us-east-1_TestPool1';
export const CLIENT_ID = 'riffletestclient0000000001';
export const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${USER_POOL_ID}`;
export const KID = 'test-kid-1';

interface SigningKey {
  privateKey: KeyObject;
  publicJwk: Record<string, unknown>;
}

function newKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey,
    publicJwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' },
  };
}

export const poolKey = newKey(KID);
/** Same kid as the pool key, different key material: what an attacker can produce. */
export const attackerKey = newKey(KID);

const b64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signJwt(
  payload: Record<string, unknown>,
  key: SigningKey = poolKey,
  header: Record<string, unknown> = { alg: 'RS256', kid: KID, typ: 'JWT' },
): string {
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

export function unsignedJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

export function accessClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'sub-river-rat',
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: 'access',
    scope: 'aws.cognito.signin.user.admin',
    auth_time: now - 60,
    iat: now - 60,
    exp: now + 3600,
    jti: 'jti-1',
    username: 'sub-river-rat',
    ...overrides,
  };
}

/** The production verifier, with the pool's JWKS preloaded so tests make no network calls. */
export function testAccessTokenVerifier() {
  const verifier = createAccessTokenVerifier(USER_POOL_ID, CLIENT_ID);
  verifier.cacheJwks({ keys: [poolKey.publicJwk as never] });
  return verifier;
}
