import { randomBytes } from 'node:crypto';

export interface PlaySession {
  matchId: string;
  bound: true;
}

export class PlaySessionStore {
  private readonly sessions = new Map<string, PlaySession>();

  create(matchId: string): string {
    const sessionId = randomBytes(32).toString('base64url');
    this.sessions.set(sessionId, { matchId, bound: true });
    return sessionId;
  }

  get(sessionId: string): PlaySession | undefined {
    return this.sessions.get(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }
}
