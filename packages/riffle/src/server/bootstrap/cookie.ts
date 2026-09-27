export const PLAY_SESSION_COOKIE = 'riffle_play';
export const PLAY_SESSION_MAX_AGE = 3600;

export function buildPlaySessionCookie(sessionId: string): string {
  const parts = [
    `${PLAY_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${PLAY_SESSION_MAX_AGE}`,
  ];
  return parts.join('; ');
}

export function parsePlaySessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(`${PLAY_SESSION_COOKIE}=`)) {
      continue;
    }
    const raw = trimmed.slice(`${PLAY_SESSION_COOKIE}=`.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
