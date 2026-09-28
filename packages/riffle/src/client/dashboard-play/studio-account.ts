export type AccountStorage = Pick<Storage, 'getItem' | 'key' | 'length'>;

export interface StudioAccount {
  email: string;
}

const LAST_AUTH_USER_RE = /^CognitoIdentityServiceProvider\.([^.]+)\.LastAuthUser$/;

function defaultAccountStorage(): AccountStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function emailFromSignInDetails(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    const details = JSON.parse(raw) as { loginId?: unknown };
    return typeof details.loginId === 'string' && details.loginId.includes('@') ? details.loginId : null;
  } catch {
    return null;
  }
}

function emailFromIdToken(raw: string | null): string | null {
  const payload = raw?.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { email?: unknown };
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}

/**
 * Display-only read of the Galaxy Class studio (Amplify) sign-in shared on this origin.
 * Tokens stay in storage; nothing here is sent to the play runtime.
 */
export function readStudioAccount(storage: AccountStorage | null = defaultAccountStorage()): StudioAccount | null {
  if (!storage) {
    return null;
  }
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      const match = key ? LAST_AUTH_USER_RE.exec(key) : null;
      if (!match) {
        continue;
      }
      const user = storage.getItem(key!);
      if (!user) {
        continue;
      }
      const prefix = `CognitoIdentityServiceProvider.${match[1]}.${user}`;
      if (!storage.getItem(`${prefix}.refreshToken`) && !storage.getItem(`${prefix}.accessToken`)) {
        continue;
      }
      const email =
        emailFromSignInDetails(storage.getItem(`${prefix}.signInDetails`)) ??
        emailFromIdToken(storage.getItem(`${prefix}.idToken`));
      if (email) {
        return { email };
      }
    }
  } catch {
    return null;
  }
  return null;
}
