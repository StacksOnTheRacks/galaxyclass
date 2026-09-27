import { TurnurAuthenticationError } from '../turnur/session.js';

export function turnurUnauthenticatedResponse(reason: string): Response {
  return Response.json({ error: 'turnur_unauthenticated', reason }, { status: 503 });
}

function isTurnurApiError(error: unknown): error is { status: number; name: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'TurnurApiError' &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

export function mapTableTurnurError(
  error: unknown,
  context: 'match' | 'seat' = 'match',
): Response {
  if (error instanceof TurnurAuthenticationError) {
    return turnurUnauthenticatedResponse(error.reason);
  }

  if (isTurnurApiError(error)) {
    if (error.status === 404) {
      return Response.json(
        { error: context === 'seat' ? 'seat_not_found' : 'match_not_found' },
        { status: 404 },
      );
    }
    if (error.status === 403) {
      return Response.json({ error: 'match_forbidden' }, { status: 403 });
    }
    if (error.status === 401) {
      return turnurUnauthenticatedResponse('invalid_key');
    }
    return Response.json({ error: 'turnur_error' }, { status: 502 });
  }

  throw error;
}

export function seatCapabilityErrorResponse(code: string): Response {
  return Response.json({ error: code }, { status: 403 });
}
