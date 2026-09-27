import type { SeatCapabilityLedger } from './ledger.js';
import {
  mintSeatCapabilityJti,
  mintSeatCapabilityToken,
  SEAT_CAPABILITY_TTL_SECONDS,
  seatCapabilityExpiresAt,
  seatCapabilityIssuedAt,
} from './token.js';

export interface MintSeatCapabilityInput {
  matchId: string;
  seatId: string;
  playerSubject: string;
}

export interface MintSeatCapabilityResult {
  token: string;
  jti: string;
  expiresIn: number;
}

export function mintSeatCapability(
  ledger: SeatCapabilityLedger,
  input: MintSeatCapabilityInput,
): MintSeatCapabilityResult {
  const token = mintSeatCapabilityToken();
  const jti = mintSeatCapabilityJti();
  const iat = seatCapabilityIssuedAt();
  const exp = seatCapabilityExpiresAt(iat);

  ledger.put(token, {
    jti,
    matchId: input.matchId,
    seatId: input.seatId,
    playerSubject: input.playerSubject,
    iat,
    exp,
    purpose: 'seat',
  });

  return {
    token,
    jti,
    expiresIn: SEAT_CAPABILITY_TTL_SECONDS,
  };
}
