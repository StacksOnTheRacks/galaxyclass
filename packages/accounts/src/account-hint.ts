import { isAvatarId } from './avatars.js';
import { validateGamerTag } from './gamer-tag.js';

/**
 * Display-only hint the studio site writes to same-origin localStorage so games
 * can show the signed-in player. It carries the public profile only — never
 * email or tokens — and games must not treat it as proof of identity.
 */
export const ACCOUNT_HINT_KEY = 'galaxyclass.account';

export interface AccountHint {
  signedIn: true;
  gamerTag: string | null;
  avatarId: number | null;
}

export function serializeAccountHint(profile: {
  gamerTag: string | null;
  avatarId: number | null;
}): string {
  const hint: AccountHint = {
    signedIn: true,
    gamerTag: profile.gamerTag,
    avatarId: profile.avatarId,
  };
  return JSON.stringify(hint);
}

/** Malformed values degrade to "signed in, no public profile"; unknown shapes to signed out. */
export function parseAccountHint(raw: string | null | undefined): AccountHint | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const hint = parsed as Record<string, unknown>;
  // Hints written before gamer tags held only an email; treat them as signed in without a tag.
  const legacySignedIn = typeof hint.email === 'string' && hint.email.includes('@');
  if (hint.signedIn !== true && !legacySignedIn) {
    return null;
  }
  const tag = validateGamerTag(hint.gamerTag);
  return {
    signedIn: true,
    gamerTag: tag.ok ? tag.value : null,
    avatarId: isAvatarId(hint.avatarId) ? hint.avatarId : null,
  };
}
