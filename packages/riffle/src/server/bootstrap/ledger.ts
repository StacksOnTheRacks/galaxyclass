import { createHash } from 'node:crypto';

export interface BootstrapLedgerEntry {
  matchId: string;
  jti: string;
  expiresAt: number;
  used: boolean;
}

export class BootstrapLedger {
  private readonly entries = new Map<string, BootstrapLedgerEntry>();

  static hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  put(token: string, entry: BootstrapLedgerEntry): void {
    this.entries.set(BootstrapLedger.hashToken(token), entry);
  }

  get(token: string): BootstrapLedgerEntry | undefined {
    return this.entries.get(BootstrapLedger.hashToken(token));
  }

  markUsed(token: string): boolean {
    const key = BootstrapLedger.hashToken(token);
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    entry.used = true;
    this.entries.set(key, entry);
    return true;
  }

  clear(): void {
    this.entries.clear();
  }
}
