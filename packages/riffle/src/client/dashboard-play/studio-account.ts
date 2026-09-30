import { ACCOUNT_HINT_KEY, parseAccountHint, type AccountHint } from '@galaxyclass/accounts/account-hint';

export { ACCOUNT_HINT_KEY };

export type AccountStorage = Pick<Storage, 'getItem'>;

/** Gamer tag and avatar id published by Galaxy Class; never email or tokens. */
export type StudioAccount = Pick<AccountHint, 'gamerTag' | 'avatarId'>;

function defaultAccountStorage(): AccountStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Display-only (table list chip); seat identity comes from the server-verified access token. */
export function readStudioAccount(storage: AccountStorage | null = defaultAccountStorage()): StudioAccount | null {
  try {
    const hint = parseAccountHint(storage?.getItem(ACCOUNT_HINT_KEY) ?? null);
    return hint ? { gamerTag: hint.gamerTag, avatarId: hint.avatarId } : null;
  } catch {
    return null;
  }
}
