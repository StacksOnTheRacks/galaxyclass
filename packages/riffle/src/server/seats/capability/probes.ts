import { requireSeatCapability, type RequireSeatCapabilityInput } from './gate.js';

export interface SeatScopedProbeInput extends Omit<RequireSeatCapabilityInput, 'ledger'> {
  ledger: RequireSeatCapabilityInput['ledger'];
}

let viewGetCallCount = 0;
let turnSetCallCount = 0;

export function resetSeatScopedProbeCounters(): void {
  viewGetCallCount = 0;
  turnSetCallCount = 0;
}

export function getSeatScopedProbeCounters(): { viewGet: number; turnSet: number } {
  return { viewGet: viewGetCallCount, turnSet: turnSetCallCount };
}

export function probeSeatScopedViewGet(input: SeatScopedProbeInput): { ok: true; jti: string } {
  const verified = requireSeatCapability(input);
  viewGetCallCount += 1;
  return { ok: true, jti: verified.jti };
}

export function probeSeatScopedTurnSet(input: SeatScopedProbeInput): { ok: true; jti: string } {
  const verified = requireSeatCapability(input);
  turnSetCallCount += 1;
  return { ok: true, jti: verified.jti };
}
