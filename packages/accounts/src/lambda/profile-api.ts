import { isAvatarId } from '../avatars.js';
import { validateGamerTag } from '../gamer-tag.js';
import type {
  GamerTagAvailability,
  ProfileApiErrorBody,
  PublicProfile,
} from '../profile-api-contract.js';
import type { ProfileStore } from '../profile-store.js';
import { profileStoreFromEnv } from './dynamo.js';

/** API Gateway HTTP API (payload v2) fields this handler reads. */
export interface HttpApiEvent {
  routeKey: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string | undefined>;
  requestContext?: {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
}

export interface HttpApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function json(statusCode: number, body: PublicProfile | GamerTagAvailability | ProfileApiErrorBody): HttpApiResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function subject(event: HttpApiEvent): string | null {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

function readBody(event: HttpApiEvent): Record<string, unknown> | null {
  if (!event.body) {
    return null;
  }
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createProfileApiHandler(getStore: () => ProfileStore) {
  return async function handle(event: HttpApiEvent): Promise<HttpApiResult> {
    try {
      const store = getStore();

      if (event.routeKey === 'GET /api/gamer-tags/{tag}') {
        const raw = event.pathParameters?.tag ?? '';
        const tag = validateGamerTag(raw);
        if (!tag.ok) {
          return json(200, { gamerTag: raw, available: false, reason: tag.error });
        }
        const available = await store.isGamerTagAvailable(tag.value);
        return json(200, available ? { gamerTag: tag.value, available } : { gamerTag: tag.value, available, reason: 'taken' });
      }

      const sub = subject(event);
      if (!sub) {
        return json(401, { error: 'unauthorized' });
      }

      if (event.routeKey === 'GET /api/profile') {
        return json(200, await store.getProfile(sub));
      }

      if (event.routeKey === 'PUT /api/profile/gamer-tag') {
        const tag = validateGamerTag(readBody(event)?.gamerTag);
        if (!tag.ok) {
          return json(400, { error: 'invalid_gamer_tag', reason: tag.error });
        }
        const result = await store.setGamerTag(sub, tag.value);
        if (!result.ok) {
          return json(409, result.reason === 'taken' ? { error: 'gamer_tag_taken' } : { error: 'conflict' });
        }
        return json(200, result.profile);
      }

      if (event.routeKey === 'PUT /api/profile/avatar') {
        const avatarId = readBody(event)?.avatarId;
        if (!isAvatarId(avatarId)) {
          return json(400, { error: 'invalid_avatar' });
        }
        return json(200, await store.setAvatar(sub, avatarId));
      }

      return json(400, { error: 'invalid_request' });
    } catch (error) {
      console.error('profile api error', error);
      return json(500, { error: 'server_error' });
    }
  };
}

export const handler = createProfileApiHandler(profileStoreFromEnv);
