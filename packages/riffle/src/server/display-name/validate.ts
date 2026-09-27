import { DISPLAY_NAME_ERROR_MESSAGE } from '../../shared/display-name.js';

export { DISPLAY_NAME_ERROR_MESSAGE };

export function normalizeDisplayName(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') {
    return { ok: false };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 24) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}
