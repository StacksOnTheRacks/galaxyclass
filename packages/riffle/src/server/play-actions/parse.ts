import { hasClientSuppliedStateKeys } from '../../match-store/errors.js';
import type { Action } from '../../rules/types.js';

export type ParsePlayActionError = 'invalid_body' | 'client_supplied_state' | 'illegal_action';

export function parsePlayActionRequest(
  raw: unknown,
): { ok: true; action: Action } | { ok: false; error: ParsePlayActionError } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' };
  }

  const body = raw as Record<string, unknown>;
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 1 || bodyKeys[0] !== 'action') {
    return { ok: false, error: 'invalid_body' };
  }

  if (hasClientSuppliedStateKeys(body)) {
    return { ok: false, error: 'client_supplied_state' };
  }

  const actionRaw = body.action;
  if (hasClientSuppliedStateKeys(actionRaw)) {
    return { ok: false, error: 'client_supplied_state' };
  }

  if (typeof actionRaw !== 'object' || actionRaw === null || Array.isArray(actionRaw)) {
    return { ok: false, error: 'illegal_action' };
  }

  const actionRecord = actionRaw as Record<string, unknown>;
  const actionKeys = Object.keys(actionRecord);
  const type = actionRecord.type;

  if (type === 'fold' || type === 'check' || type === 'call') {
    if (actionKeys.length !== 1 || actionKeys[0] !== 'type') {
      return { ok: false, error: 'illegal_action' };
    }
    return { ok: true, action: { type } };
  }

  if (type === 'bet' || type === 'raise') {
    if (!actionKeys.every((key) => key === 'type' || key === 'amount')) {
      return { ok: false, error: 'illegal_action' };
    }
    const amount = actionRecord.amount;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return { ok: false, error: 'illegal_action' };
    }
    return { ok: true, action: { type, amount } };
  }

  return { ok: false, error: 'illegal_action' };
}
