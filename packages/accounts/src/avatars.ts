/**
 * Galaxy Class owns the player avatar library. Images ship with the studio
 * site and are served from `${origin}/avatars/<id>.webp`; games reference them
 * by id and never bundle their own copies.
 */
export const AVATAR_COUNT = 116;
export const AVATAR_PATH = '/avatars';
export const GALAXY_CLASS_ORIGIN = 'https://galaxyclass.app';

export const AVATAR_IDS: readonly number[] = Array.from({ length: AVATAR_COUNT }, (_, index) => index + 1);

export function isAvatarId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= AVATAR_COUNT;
}

/** Relative to the Galaxy Class site by default; pass an origin when rendering elsewhere. */
export function avatarUrl(id: number, origin = ''): string {
  const safeId = isAvatarId(id) ? id : 1;
  return `${origin.replace(/\/$/, '')}${AVATAR_PATH}/${safeId}.webp`;
}

/** The random avatar given to anonymous players and to new accounts. */
export function randomAvatarId(random: () => number = Math.random): number {
  return (Math.floor(random() * AVATAR_COUNT) % AVATAR_COUNT) + 1;
}

/** Stable avatar for a seed, so a player without a stored avatar keeps one face everywhere. */
export function avatarIdForSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % AVATAR_COUNT) + 1;
}
