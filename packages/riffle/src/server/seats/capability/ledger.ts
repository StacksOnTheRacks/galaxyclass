import { hashSeatCapabilityToken, type SeatCapabilityClaims } from './token.js';

export type { SeatCapabilityClaims };

export class SeatCapabilityLedger {
  private readonly entries = new Map<string, SeatCapabilityClaims>();

  put(token: string, claims: SeatCapabilityClaims): void {
    this.entries.set(hashSeatCapabilityToken(token), claims);
  }

  get(token: string): SeatCapabilityClaims | undefined {
    return this.entries.get(hashSeatCapabilityToken(token));
  }

  clear(): void {
    this.entries.clear();
  }
}
