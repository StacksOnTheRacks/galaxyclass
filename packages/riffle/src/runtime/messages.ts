import type { ClientMessage } from './types.js';

const UNSUPPORTED_GAMEPLAY_ACTIONS = new Set(['deal']);

const CLIENT_SUPPLIED_STATE_KEYS = [
  'stack',
  'stacks',
  'blinds',
  'pot',
  'deal',
  'hole',
  'holeCards',
  'board',
  'winners',
  'street',
] as const;

export function parseClientMessage(body: string | null | undefined): ClientMessage | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as ClientMessage).action !== 'string'
    ) {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

export function isUnsupportedGameplayAction(action: string): boolean {
  return UNSUPPORTED_GAMEPLAY_ACTIONS.has(action);
}

export function hasClientSuppliedState(message: ClientMessage): boolean {
  return CLIENT_SUPPLIED_STATE_KEYS.some((key) => message[key] !== undefined);
}
