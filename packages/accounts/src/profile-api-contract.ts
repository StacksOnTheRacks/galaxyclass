import type { GamerTagError } from './gamer-tag.js';

/**
 * Wire contract for the Galaxy Class profile API, served same-origin at /api.
 * Responses avoid 403/404 because the site distribution rewrites those to the
 * static app shell.
 */
export const PROFILE_API_ROUTES = {
  profile: '/api/profile',
  gamerTag: '/api/profile/gamer-tag',
  avatar: '/api/profile/avatar',
  gamerTagAvailability: '/api/gamer-tags',
} as const;

/** Thrown by the PreSignUp trigger; Cognito surfaces it inside the sign-up error message. */
export const SIGN_UP_ERROR_CODES = {
  required: 'GAMER_TAG_REQUIRED',
  invalid: 'GAMER_TAG_INVALID',
  taken: 'GAMER_TAG_TAKEN',
} as const;

export interface PublicProfile {
  gamerTag: string | null;
  avatarId: number;
}

export interface GamerTagAvailability {
  gamerTag: string;
  available: boolean;
  reason?: GamerTagError | 'taken';
}

export type ProfileApiErrorBody =
  | { error: 'invalid_gamer_tag'; reason: GamerTagError }
  | { error: 'gamer_tag_taken' }
  | { error: 'invalid_avatar' }
  | { error: 'invalid_request' }
  | { error: 'conflict' }
  | { error: 'unauthorized' }
  | { error: 'server_error' };
