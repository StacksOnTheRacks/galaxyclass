import { publicBase } from '../dashboard/public-base.js';

const GROUP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GroupListing {
  id: string;
  name: string;
  hostLabel: string;
  variantLabel: string;
  blindsLabel: string;
  buyInLabel: string;
  maxSeats: number;
}

export type TableListing = GroupListing;

/** Public Cognito ids for the Galaxy Class player pool; no secrets. */
export interface PlayAuthConfig {
  userPoolId: string;
  userPoolClientId: string;
}

export interface PlayConfig {
  webSocketUrl: string;
  groups: GroupListing[];
  auth?: PlayAuthConfig;
}

const USER_POOL_ID_RE = /^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/;
const CLIENT_ID_RE = /^[a-z0-9]{1,128}$/;

function parseAuthConfig(value: unknown): PlayAuthConfig | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { userPoolId, userPoolClientId } = value as Record<string, unknown>;
  if (
    typeof userPoolId !== 'string' ||
    !USER_POOL_ID_RE.test(userPoolId) ||
    typeof userPoolClientId !== 'string' ||
    !CLIENT_ID_RE.test(userPoolClientId)
  ) {
    return undefined;
  }
  return { userPoolId, userPoolClientId };
}

function parseGroupListing(value: unknown): GroupListing | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const { id, name, hostLabel, variantLabel, blindsLabel, buyInLabel, maxSeats } = row;
  if (typeof id !== 'string' || !GROUP_ID_RE.test(id) || UUID_RE.test(id)) {
    return null;
  }
  if (
    typeof name !== 'string' ||
    typeof hostLabel !== 'string' ||
    typeof variantLabel !== 'string' ||
    typeof blindsLabel !== 'string' ||
    typeof buyInLabel !== 'string'
  ) {
    return null;
  }
  if (typeof maxSeats !== 'number' || !Number.isInteger(maxSeats) || maxSeats <= 0) {
    return null;
  }
  return { id, name, hostLabel, variantLabel, blindsLabel, buyInLabel, maxSeats };
}

export async function loadPlayConfig(fetchImpl: typeof fetch): Promise<PlayConfig | null> {
  try {
    const response = await fetchImpl(`${publicBase()}/config.json`, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const { webSocketUrl, groups, auth } = body as Record<string, unknown>;
    if (typeof webSocketUrl !== 'string' || !/^wss?:\/\//.test(webSocketUrl)) {
      return null;
    }
    const parsedGroups = Array.isArray(groups)
      ? groups
          .map(parseGroupListing)
          .filter((entry): entry is GroupListing => entry !== null)
      : [];
    const parsedAuth = parseAuthConfig(auth);
    return parsedAuth
      ? { webSocketUrl, groups: parsedGroups, auth: parsedAuth }
      : { webSocketUrl, groups: parsedGroups };
  } catch {
    return null;
  }
}
