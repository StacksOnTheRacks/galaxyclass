import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createAccessTokenVerifier } from '@galaxyclass/accounts/player-verifier';

export const USER_POOL_ID = 'us-east-1_TestPool1';
export const CLIENT_ID = 'warshipstestclient00000001';
export const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${USER_POOL_ID}`;
const KID = 'test-kid-1';

interface SigningKey {
  privateKey: KeyObject;
  publicJwk: Record<string, unknown>;
}

function newKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, publicJwk: { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' } };
}

export const poolKey = newKey();
export const attackerKey = newKey();

const b64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signAccessToken(overrides: Record<string, unknown> = {}, key: SigningKey = poolKey): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'sub-admiral',
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: 'access',
    scope: 'aws.cognito.signin.user.admin',
    auth_time: now - 60,
    iat: now - 60,
    exp: now + 3600,
    jti: 'jti-1',
    username: 'sub-admiral',
    ...overrides,
  };
  const signingInput = `${b64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64url(payload)}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

export function testAccessTokenVerifier() {
  const verifier = createAccessTokenVerifier(USER_POOL_ID, CLIENT_ID);
  verifier.cacheJwks({ keys: [poolKey.publicJwk as never] });
  return verifier;
}
