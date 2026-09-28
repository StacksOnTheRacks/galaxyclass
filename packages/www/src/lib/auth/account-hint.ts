/**
 * Display-only account hint for same-origin games (Riffle reads it for its "Playing as" chip).
 * Holds the email only — never tokens — so games never need to read Amplify storage.
 */
export const ACCOUNT_HINT_KEY = "galaxyclass.account";

export function writeAccountHint(email: string): void {
  try {
    if (email) {
      window.localStorage.setItem(ACCOUNT_HINT_KEY, JSON.stringify({ email }));
    } else {
      window.localStorage.removeItem(ACCOUNT_HINT_KEY);
    }
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
