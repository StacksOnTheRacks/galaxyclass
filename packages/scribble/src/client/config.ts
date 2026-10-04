import { publicBase } from './route.js';

/** Public Cognito ids for the Galaxy Class player pool; no secrets. */
export interface AuthConfig {
  userPoolId: string;
  userPoolClientId: string;
}

export interface TableListing {
  id: string;
  name: string;
  blurb: string;
}

export interface ScribbleConfig {
  webSocketUrl: string;
  tables: TableListing[];
  auth?: AuthConfig;
  /** Set only by the local dev server: read a dev access token and expose test hooks. */
  dev?: boolean;
}

const USER_POOL_ID_RE = /^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/;
const CLIENT_ID_RE = /^[a-z0-9]{1,128}$/;
const TABLE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const MAX_TABLES = 32;

function parseAuth(value: unknown): AuthConfig | undefined {
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

function parseTable(value: unknown): TableListing | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { id, name, blurb } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !TABLE_ID_RE.test(id) || typeof name !== 'string' || name.trim() === '') {
    return null;
  }
  return { id, name: name.slice(0, 60), blurb: typeof blurb === 'string' ? blurb.slice(0, 140) : '' };
}

export function parseConfig(body: unknown): ScribbleConfig | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.webSocketUrl !== 'string' || !/^wss?:\/\//.test(raw.webSocketUrl)) {
    return null;
  }
  const tables = (Array.isArray(raw.tables) ? raw.tables : [])
    .map(parseTable)
    .filter((table): table is TableListing => table !== null)
    .slice(0, MAX_TABLES);
  const auth = parseAuth(raw.auth);
  return {
    webSocketUrl: raw.webSocketUrl,
    tables,
    ...(auth ? { auth } : {}),
    ...(raw.dev === true ? { dev: true } : {}),
  };
}

export async function loadConfig(fetchImpl: typeof fetch): Promise<ScribbleConfig | null> {
  try {
    const response = await fetchImpl(`${publicBase()}/config.json`, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return parseConfig(await response.json());
  } catch {
    return null;
  }
}
