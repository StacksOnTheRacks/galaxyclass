import { beforeEach, describe, expect, it } from 'vitest';
import { createCognitoTriggerHandler, type CognitoTriggerEvent } from '../src/lambda/cognito-triggers.js';
import { createProfileApiHandler, type HttpApiEvent } from '../src/lambda/profile-api.js';
import { createProfileStore, type ProfileStore } from '../src/profile-store.js';
import { MemoryDynamo } from './support/memory-dynamo.js';

function authed(routeKey: string, sub: string, body?: unknown): HttpApiEvent {
  return {
    routeKey,
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
  };
}

function trigger(triggerSource: string, request: CognitoTriggerEvent['request']): CognitoTriggerEvent {
  return { triggerSource, request, response: {} };
}

describe('lambdas', () => {
  let store: ProfileStore;
  let api: ReturnType<typeof createProfileApiHandler>;
  let cognito: ReturnType<typeof createCognitoTriggerHandler>;

  beforeEach(() => {
    store = createProfileStore({ client: new MemoryDynamo(), tableName: 'profiles', random: () => 0 });
    api = createProfileApiHandler(() => store);
    cognito = createCognitoTriggerHandler(() => store);
  });

  describe('profile api', () => {
    it('returns the caller profile', async () => {
      const response = await api(authed('GET /api/profile', 'sub-1'));
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(JSON.parse(response.body)).toEqual({ gamerTag: null, avatarId: 1 });
    });

    it('requires a verified subject for profile routes', async () => {
      const response = await api({ routeKey: 'GET /api/profile' });
      expect(response.statusCode).toBe(401);
    });

    it('sets a gamer tag, and reports taken tags as 409', async () => {
      const first = await api(authed('PUT /api/profile/gamer-tag', 'sub-1', { gamerTag: ' Photon ' }));
      expect(first.statusCode).toBe(200);
      expect(JSON.parse(first.body).gamerTag).toBe('Photon');

      const second = await api(authed('PUT /api/profile/gamer-tag', 'sub-2', { gamerTag: 'PHOTON' }));
      expect(second.statusCode).toBe(409);
      expect(JSON.parse(second.body)).toEqual({ error: 'gamer_tag_taken' });
    });

    it('rejects invalid gamer tags with the rule that failed', async () => {
      const response = await api(authed('PUT /api/profile/gamer-tag', 'sub-1', { gamerTag: '-bad' }));
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: 'invalid_gamer_tag', reason: 'invalid_edges' });
      expect((await api(authed('PUT /api/profile/gamer-tag', 'sub-1'))).statusCode).toBe(400);
    });

    it('saves valid avatars and rejects others', async () => {
      const saved = await api(authed('PUT /api/profile/avatar', 'sub-1', { avatarId: 33 }));
      expect(JSON.parse(saved.body)).toMatchObject({ avatarId: 33 });
      for (const avatarId of [0, 117, '33', 2.5]) {
        const response = await api(authed('PUT /api/profile/avatar', 'sub-1', { avatarId }));
        expect(response.statusCode).toBe(400);
      }
    });

    it('answers public availability checks without auth', async () => {
      await api(authed('PUT /api/profile/gamer-tag', 'sub-1', { gamerTag: 'Photon' }));
      const check = (tag: string) =>
        api({ routeKey: 'GET /api/gamer-tags/{tag}', pathParameters: { tag } }).then((response) =>
          JSON.parse(response.body),
        );
      expect(await check('photon')).toEqual({ gamerTag: 'photon', available: false, reason: 'taken' });
      expect(await check('Quasar')).toEqual({ gamerTag: 'Quasar', available: true });
      expect(await check('no spaces')).toMatchObject({ available: false, reason: 'invalid_characters' });
    });

    it('never answers with 403 or 404, which the site CDN would rewrite', async () => {
      const response = await api(authed('DELETE /api/profile', 'sub-1'));
      expect(response.statusCode).toBe(400);
    });

    it('hides internal errors', async () => {
      const failing = createProfileApiHandler(() => {
        throw new Error('boom');
      });
      const response = await failing(authed('GET /api/profile', 'sub-1'));
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('boom');
    });
  });

  describe('cognito triggers', () => {
    const signUp = (gamerTag?: string, email = 'new@example.com') =>
      cognito(
        trigger('PreSignUp_SignUp', {
          userAttributes: { email },
          clientMetadata: gamerTag === undefined ? {} : { gamerTag },
        }),
      );

    it('reserves the gamer tag during sign-up', async () => {
      await expect(signUp('NovaStar')).resolves.toMatchObject({ triggerSource: 'PreSignUp_SignUp' });
      expect(await store.isGamerTagAvailable('novastar')).toBe(false);
    });

    it('fails sign-up with a code the site can map to an inline error', async () => {
      await expect(signUp()).rejects.toThrow('GAMER_TAG_REQUIRED');
      await expect(signUp('bad tag')).rejects.toThrow('GAMER_TAG_INVALID');
      await signUp('NovaStar');
      await expect(signUp('novastar', 'other@example.com')).rejects.toThrow('GAMER_TAG_TAKEN');
    });

    it('claims the reserved tag on confirmation only', async () => {
      await signUp('NovaStar');
      await cognito(
        trigger('PostConfirmation_ConfirmForgotPassword', {
          userAttributes: { sub: 'sub-new', email: 'new@example.com' },
        }),
      );
      expect((await store.getProfile('sub-new')).gamerTag).toBeNull();

      await cognito(
        trigger('PostConfirmation_ConfirmSignUp', {
          userAttributes: { sub: 'sub-new', email: 'new@example.com' },
        }),
      );
      expect((await store.getProfile('sub-new')).gamerTag).toBe('NovaStar');
    });

    it('never blocks confirmation when the profile write fails', async () => {
      const broken = createCognitoTriggerHandler(() => ({
        ...store,
        claimPendingGamerTag: async () => {
          throw new Error('dynamo down');
        },
      }));
      const event = trigger('PostConfirmation_ConfirmSignUp', {
        userAttributes: { sub: 'sub-new', email: 'new@example.com' },
      });
      await expect(broken(event)).resolves.toBe(event);
    });

    it('ignores admin-created users and other triggers', async () => {
      const event = trigger('PreSignUp_AdminCreateUser', { userAttributes: { email: 'a@example.com' } });
      await expect(cognito(event)).resolves.toBe(event);
    });
  });
});
