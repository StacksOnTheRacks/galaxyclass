const TABLE_PATH_RE =
  /^\/(?:riffle\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

const GROUP_PATH_RE = /^\/(?:riffle\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

const TABLE_LIST_PATH_RE = /^(?:\/riffle\/?|\/)$/;

export function parseTableIdFromPath(pathname: string): string | null {
  const match = TABLE_PATH_RE.exec(pathname);
  return match ? match[1]! : null;
}

/** Stakes-group slug such as `/riffle/the-limp`. The lobby and table UUIDs are not groups. */
export function parseGroupIdFromPath(pathname: string): string | null {
  if (parseTableIdFromPath(pathname) || isTableListPath(pathname)) {
    return null;
  }
  const match = GROUP_PATH_RE.exec(pathname);
  return match ? match[1]! : null;
}

export function isTableListPath(pathname: string): boolean {
  return TABLE_LIST_PATH_RE.test(pathname);
}
