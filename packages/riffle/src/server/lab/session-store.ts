export interface LabSessionEntry {
  matchId: string;
  seatIds: [string, string];
  dealOpened?: boolean;
}

export interface LabSessionStore {
  register(entry: Omit<LabSessionEntry, 'dealOpened'>): void;
  get(matchId: string): LabSessionEntry | undefined;
  markDealOpened(matchId: string): void;
}

export function createLabSessionStore(): LabSessionStore {
  const sessions = new Map<string, LabSessionEntry>();

  return {
    register(entry) {
      sessions.set(entry.matchId, { ...entry, dealOpened: false });
    },
    get(matchId) {
      return sessions.get(matchId);
    },
    markDealOpened(matchId) {
      const session = sessions.get(matchId);
      if (session) {
        session.dealOpened = true;
      }
    },
  };
}
