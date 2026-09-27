const DEFAULT_NEXT = "/account";

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
