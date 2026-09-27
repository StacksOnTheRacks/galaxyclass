const CONFIRM_EMAIL_KEY = "galaxyclass.confirm.email";
const RESET_EMAIL_KEY = "galaxyclass.reset.email";

function readKey(key: string): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(key) ?? "";
}

function writeKey(key: string, email: string) {
  sessionStorage.setItem(key, email);
}

export function rememberConfirmEmail(email: string) {
  writeKey(CONFIRM_EMAIL_KEY, email);
}

export function readConfirmEmail(): string {
  return readKey(CONFIRM_EMAIL_KEY);
}

export function rememberResetEmail(email: string) {
  writeKey(RESET_EMAIL_KEY, email);
}

export function readResetEmail(): string {
  return readKey(RESET_EMAIL_KEY);
}
