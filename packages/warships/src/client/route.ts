declare const WARSHIPS_PUBLIC_BASE: string | undefined;

/** `/warships` in the deployed bundle; the dev server builds the same bundle. */
export function publicBase(): string {
  return typeof WARSHIPS_PUBLIC_BASE === 'string' ? WARSHIPS_PUBLIC_BASE : '/warships';
}

export type Route = { kind: 'lobby' } | { kind: 'table'; tableId: string } | { kind: 'not_found' };

const TABLE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** `/warships` lists tables; `/warships/<tableId>` enters one. Anything deeper is unknown. */
export function parseRoute(pathname: string, base = publicBase()): Route {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === base || trimmed === `${base}/index.html`) {
    return { kind: 'lobby' };
  }
  if (!trimmed.startsWith(`${base}/`)) {
    return { kind: 'not_found' };
  }
  const rest = trimmed.slice(base.length + 1);
  if (!TABLE_ID_RE.test(rest)) {
    return { kind: 'not_found' };
  }
  return { kind: 'table', tableId: rest };
}

export function tablePath(tableId: string, base = publicBase()): string {
  return `${base}/${encodeURIComponent(tableId)}`;
}
