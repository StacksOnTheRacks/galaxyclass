import { ACCOUNT_HINT_KEY, serializeAccountHint } from "@galaxyclass/accounts/account-hint";

/**
 * Display-only account hint for same-origin games (Riffle reads it for its "Playing as" chip
 * and seat name). Holds the public profile only — never email or tokens — so games never
 * need to read Amplify storage.
 */
export { ACCOUNT_HINT_KEY };

export function writeAccountHint(profile: {
  gamerTag: string | null;
  avatarId: number | null;
}): void {
  try {
    window.localStorage.setItem(ACCOUNT_HINT_KEY, serializeAccountHint(profile));
  } catch {
    // Storage unavailable; games fall back to guest.
  }
}

export function clearAccountHint(): void {
  try {
    window.localStorage.removeItem(ACCOUNT_HINT_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
