import type { Result, RulesError, RulesErrorCode } from './types.js';

export function err<T>(code: RulesErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function isRulesError(value: unknown): value is RulesError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}
