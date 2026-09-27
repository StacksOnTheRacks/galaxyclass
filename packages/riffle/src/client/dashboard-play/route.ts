const TABLE_PATH_RE =
  /^\/(?:riffle\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export function parseTableIdFromPath(pathname: string): string | null {
  const match = TABLE_PATH_RE.exec(pathname);
  return match ? match[1]! : null;
}
