export const IDENTITY_SESSION_KEY = 'riffle.identity.session';

export interface StoredIdentitySession {
  bearer: string;
  playerSubject: string;
  kind?: 'account' | 'anonymous';
  email?: string;
}

export function readStoredSession(): StoredIdentitySession | undefined {
  const raw = window.sessionStorage.getItem(IDENTITY_SESSION_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as StoredIdentitySession;
    if (
      typeof parsed.bearer === 'string' &&
      parsed.bearer.length > 0 &&
      typeof parsed.playerSubject === 'string' &&
      parsed.playerSubject.length > 0
    ) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function writeStoredSession(session: StoredIdentitySession): void {
  window.sessionStorage.setItem(IDENTITY_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  window.sessionStorage.removeItem(IDENTITY_SESSION_KEY);
}

export function identityAuthHeaders(): HeadersInit {
  const session = readStoredSession();
  if (!session) {
    return { 'Content-Type': 'application/json' };
  }
  return {
    Authorization: `Bearer ${session.bearer}`,
    'Content-Type': 'application/json',
  };
}
