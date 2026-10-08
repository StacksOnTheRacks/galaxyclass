const DEFAULT_NEXT = "/account";

/** Games are separate apps behind the studio's CDN; the Next router cannot client-route into them. */
const GAME_PATHS = ["/riffle", "/scribble", "/warships", "/whodunit"];

/** Single-slash relative path. Rejects protocol-relative, schemes, and backslashes. */
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return DEFAULT_NEXT;
  }
  if (path.includes("\\") || path.includes("://") || path.includes(":")) {
    return DEFAULT_NEXT;
  }
  if (/[\u0000-\u001F\u007F]/.test(path)) return DEFAULT_NEXT;
  return path;
}

export function readNextFromLocation(): string {
  if (typeof window === "undefined") return DEFAULT_NEXT;
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/** The caller's `next`, only when one was given and it is safe; for carrying it across auth pages. */
export function readNextParam(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value) return null;
  const path = safeNext(value);
  return path === value.trim() ? path : null;
}

export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export function isGamePath(path: string): boolean {
  return GAME_PATHS.some(
    (base) => path === base || ["/", "?", "#"].some((separator) => path.startsWith(`${base}${separator}`)),
  );
}
