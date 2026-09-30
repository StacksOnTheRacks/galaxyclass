import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import {
  createPlayerResolver,
  createProfileLookup,
  playerResolverFromEnv,
} from '../../src/runtime/player-identity.js';
import {
  accessClaims,
  attackerKey,
  CLIENT_ID,
  signJwt,
  testAccessTokenVerifier,
  unsignedJwt,
  USER_POOL_ID,
} from '../helpers/cognito-tokens.js';

const PROFILE = { gamerTag: 'River_Rat', avatarId: 42 };

function resolver() {
  const lookupProfile = vi.fn(async () => PROFILE);
  return { resolve: createPlayerResolver(testAccessTokenVerifier(), lookupProfile), lookupProfile };
}

describe('Cognito access token verification', () => {
  it('accepts a pool-signed access token and takes the name and avatar from the profile of its sub', async () => {
    const { resolve, lookupProfile } = resolver();
    const token = signJwt(accessClaims({ username: 'Admin', gamerTag: 'Admin', avatarId: 7 }));

    await expect(resolve(token)).resolves.toEqual({ sub: 'sub-river-rat', ...PROFILE });
    expect(lookupProfile).toHaveBeenCalledWith('sub-river-rat');
  });

  it('rejects a token signed by another key under the pool kid (forged)', async () => {
    const { resolve, lookupProfile } = resolver();
    await expect(resolve(signJwt(accessClaims(), attackerKey))).resolves.toBeNull();
    expect(lookupProfile).not.toHaveBeenCalled();
  });

  it('rejects an unsigned alg=none token', async () => {
    const { resolve } = resolver();
    await expect(resolve(unsignedJwt(accessClaims()))).resolves.toBeNull();
  });

  it('rejects a token from another issuer', async () => {
    const { resolve } = resolver();
    const token = signJwt(
      accessClaims({ iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_OtherPool' }),
    );
    await expect(resolve(token)).resolves.toBeNull();
  });

  it('rejects a token issued to another app client (wrong audience)', async () => {
    const { resolve } = resolver();
    await expect(resolve(signJwt(accessClaims({ client_id: 'someotherclient' })))).resolves.toBeNull();
  });

  it('rejects an ID token even for the right client', async () => {
    const { resolve } = resolver();
    const idToken = signJwt(
      accessClaims({ token_use: 'id', aud: CLIENT_ID, client_id: undefined, 'cognito:username': 'x' }),
    );
    await expect(resolve(idToken)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const { resolve } = resolver();
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(accessClaims({ iat: now - 7200, auth_time: now - 7200, exp: now - 60 }));
    await expect(resolve(token)).resolves.toBeNull();
  });

  it('rejects a valid token whose claims were edited after signing', async () => {
    const { resolve, lookupProfile } = resolver();
    const [header, , signature] = signJwt(accessClaims()).split('.');
    const tamperedPayload = Buffer.from(JSON.stringify(accessClaims({ sub: 'sub-victim' }))).toString(
      'base64url',
    );
    await expect(resolve(`${header}.${tamperedPayload}.${signature}`)).resolves.toBeNull();
    expect(lookupProfile).not.toHaveBeenCalled();
  });

  it('rejects garbage and empty tokens', async () => {
    const { resolve } = resolver();
    for (const token of ['', 'not-a-jwt', 'a.b.c', 'Bearer x']) {
      await expect(resolve(token)).resolves.toBeNull();
    }
  });
});

describe('profile lookup', () => {
  it('reads USER#<sub> and keeps only a valid gamer tag and avatar id', async () => {
    const send = vi.fn(async (command: unknown) => {
      expect(command).toBeInstanceOf(GetCommand);
      expect((command as GetCommand).input).toMatchObject({
        TableName: 'profiles',
        Key: { pk: 'USER#sub-1' },
      });
      return { Item: { gamerTag: 'River_Rat', avatarId: 42 } };
    });
    await expect(createProfileLookup({ send }, 'profiles')('sub-1')).resolves.toEqual(PROFILE);
  });

  it('drops stored values that are not a valid gamer tag or avatar', async () => {
    const send = vi.fn(async () => ({ Item: { gamerTag: 'Lucky Otter', avatarId: 9999 } }));
    await expect(createProfileLookup({ send }, 'profiles')('sub-1')).resolves.toEqual({
      gamerTag: null,
      avatarId: null,
    });
  });
});

describe('playerResolverFromEnv', () => {
  it('is off unless the pool, client, and profile table are all configured', () => {
    const client = { send: vi.fn() };
    expect(playerResolverFromEnv({}, client)).toBeNull();
    expect(playerResolverFromEnv({ userPoolId: USER_POOL_ID, clientId: CLIENT_ID }, client)).toBeNull();
    expect(
      playerResolverFromEnv(
        { userPoolId: USER_POOL_ID, clientId: CLIENT_ID, profileTableName: 'profiles' },
        client,
      ),
    ).toBeTypeOf('function');
  });
});
