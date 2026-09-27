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

export interface PlayConfig {
  webSocketUrl: string;
  tables: TableListing[];
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
    const { webSocketUrl, tables } = body as Record<string, unknown>;
    if (typeof webSocketUrl !== 'string' || !/^wss?:\/\//.test(webSocketUrl)) {
      return null;
    }
    const parsedTables = Array.isArray(tables)
      ? tables
          .map(parseTableListing)
          .filter((entry): entry is TableListing => entry !== null)
      : [];
    return { webSocketUrl, tables: parsedTables };
  } catch {
    return null;
  }
}
