const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}
