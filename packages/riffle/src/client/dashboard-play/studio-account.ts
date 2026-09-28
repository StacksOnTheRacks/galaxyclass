export type AccountStorage = Pick<Storage, 'getItem'>;

export interface StudioAccount {
  email: string;
}

/** Written by the Galaxy Class studio site on sign-in; email only, never tokens. */
export const ACCOUNT_HINT_KEY = 'galaxyclass.account';

function defaultAccountStorage(): AccountStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Display-only: Riffle must not read studio auth storage, only this hint. */
export function readStudioAccount(storage: AccountStorage | null = defaultAccountStorage()): StudioAccount | null {
  try {
    const raw = storage?.getItem(ACCOUNT_HINT_KEY);
    if (!raw) {
      return null;
    }
    const hint = JSON.parse(raw) as { email?: unknown };
    return typeof hint.email === 'string' && hint.email.includes('@') ? { email: hint.email } : null;
  } catch {
    return null;
  }
}
