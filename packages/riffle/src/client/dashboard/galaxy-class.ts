import { GALAXY_CLASS_ORIGIN, avatarIdForSeed, avatarUrl } from '@galaxyclass/accounts/avatars';
import { galaxyClassLibraryUrl as libraryUrl } from '@galaxyclass/accounts/game-header';
import { publicBase } from './public-base.js';

/**
 * Under /riffle the SPA shares galaxyclass.app's origin, so studio assets and
 * pages stay relative; the standalone root dashboard points at the live site.
 */
export function galaxyClassOrigin(): string {
  return publicBase() ? '' : GALAXY_CLASS_ORIGIN;
}

export function galaxyClassAvatarUrl(avatarId: number): string {
  return avatarUrl(avatarId, galaxyClassOrigin());
}

/** Seats from older runtimes carry no avatar id; fall back to a stable per-seat face. */
export function seatAvatarUrl(avatarId: number | undefined, seed: string): string {
  return galaxyClassAvatarUrl(avatarId ?? avatarIdForSeed(seed));
}

export function galaxyClassLibraryUrl(): string {
  return libraryUrl(galaxyClassOrigin());
}
