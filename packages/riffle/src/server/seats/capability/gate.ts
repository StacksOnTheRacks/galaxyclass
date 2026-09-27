import type { SeatCapabilityLedger } from './ledger.js';
import {
  isSeatCapabilityExpired,
  isValidSeatCapabilityTokenFormat,
} from './token.js';

export type SeatCapabilityErrorCode =
  | 'missing_capability'
  | 'invalid_capability'
  | 'expired_capability'
  | 'wrong_seat'
  | 'wrong_match';

export class SeatCapabilityError extends Error {
  readonly code: SeatCapabilityErrorCode;

  constructor(code: SeatCapabilityErrorCode) {
    super(code);
    this.name = 'SeatCapabilityError';
    this.code = code;
  }
}

export interface RequireSeatCapabilityInput {
  matchId: string;
  seatId: string;
  token: string | undefined | null;
  attachedMatchId?: string;
  ledger: SeatCapabilityLedger;
  nowSeconds?: number;
}

export interface VerifiedSeatCapability {
  playerSubject: string;
  jti: string;
}

export function requireSeatCapability(
  input: RequireSeatCapabilityInput,
): VerifiedSeatCapability {
  const token = typeof input.token === 'string' ? input.token.trim() : '';

  if (!token) {
    throw new SeatCapabilityError('missing_capability');
  }

  if (!isValidSeatCapabilityTokenFormat(token)) {
    throw new SeatCapabilityError('invalid_capability');
  }

  const claims = input.ledger.get(token);
  if (!claims || claims.purpose !== 'seat') {
    throw new SeatCapabilityError('invalid_capability');
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (isSeatCapabilityExpired(claims.exp, nowSeconds)) {
    throw new SeatCapabilityError('expired_capability');
  }

  if (
    input.attachedMatchId !== undefined &&
    (input.attachedMatchId !== input.matchId || input.attachedMatchId !== claims.matchId)
  ) {
    throw new SeatCapabilityError('wrong_match');
  }

  if (claims.matchId !== input.matchId) {
    throw new SeatCapabilityError('wrong_match');
  }

  if (claims.seatId !== input.seatId) {
    throw new SeatCapabilityError('wrong_seat');
  }

  return {
    playerSubject: claims.playerSubject,
    jti: claims.jti,
  };
}
