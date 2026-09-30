import { publicBase } from '../dashboard/public-base.js';

const TABLE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TableListing {
  id: string;
  name: string;
  hostLabel: string;
  variantLabel: string;
  blindsLabel: string;
  buyInLabel: string;
  maxSeats: number;
}

/** Public Cognito ids for the Galaxy Class player pool; no secrets. */
export interface PlayAuthConfig {
  userPoolId: string;
  userPoolClientId: string;
}

export interface PlayConfig {
  webSocketUrl: string;
  tables: TableListing[];
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

function parseTableListing(value: unknown): TableListing | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const { id, name, hostLabel, variantLabel, blindsLabel, buyInLabel, maxSeats } = row;
  if (typeof id !== 'string' || !TABLE_ID_RE.test(id)) {
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
    const { webSocketUrl, tables, auth } = body as Record<string, unknown>;
    if (typeof webSocketUrl !== 'string' || !/^wss?:\/\//.test(webSocketUrl)) {
      return null;
    }
    const parsedTables = Array.isArray(tables)
      ? tables
          .map(parseTableListing)
          .filter((entry): entry is TableListing => entry !== null)
      : [];
    const parsedAuth = parseAuthConfig(auth);
    return parsedAuth
      ? { webSocketUrl, tables: parsedTables, auth: parsedAuth }
      : { webSocketUrl, tables: parsedTables };
  } catch {
    return null;
  }
}
