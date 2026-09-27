export const DISPLAY_NAME_ERROR_MESSAGE = 'Name must be 3–24 characters.';
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 24;

export type DisplayNameValidation = { ok: true; value: string } | { ok: false };

export function validateDisplayName(raw: unknown): DisplayNameValidation {
  if (typeof raw !== 'string') {
    return { ok: false };
  }
  const value = raw.trim();
  if (value.length < DISPLAY_NAME_MIN_LENGTH || value.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, value };
}
