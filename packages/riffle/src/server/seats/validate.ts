export function validateMatchId(value: unknown): string | undefined {
  const matchId = typeof value === 'string' ? value.trim() : '';
  if (!matchId || matchId.length > 128) {
    return undefined;
  }
  return matchId;
}

export function validateSeatId(value: unknown): string | undefined {
  const seatId = typeof value === 'string' ? value.trim() : '';
  if (!seatId || seatId.length > 128) {
    return undefined;
  }
  return seatId;
}

const IDENTITY_FIELD_DENYLIST = new Set([
  'playerId',
  'playerSubject',
  'userId',
  'user',
  'subject',
  'displayName',
  'name',
  'email',
  'identity',
  'hostPlayerId',
  'view',
  'hiddenView',
  'holeCards',
]);

export function rosterSeatOnly<T extends { seatId: string; createdAt?: string }>(
  seat: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { seatId: seat.seatId };
  if (typeof seat.createdAt === 'string') {
    result.createdAt = seat.createdAt;
  }
  for (const key of Object.keys(seat)) {
    if (IDENTITY_FIELD_DENYLIST.has(key)) {
      continue;
    }
    if (key !== 'seatId' && key !== 'createdAt') {
      // Omit any extra Turnur fields from the Riffle-facing roster.
      continue;
    }
  }
  return result as T;
}
