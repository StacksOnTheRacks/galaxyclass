export type SessionKind = 'account' | 'anonymous';

export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface SessionRecord {
  bearer: string;
  playerSubject: string;
  kind: SessionKind;
  accountId?: string;
  email?: string;
}

export interface IssueSessionResult {
  bearer: string;
  playerSubject: string;
}

export interface SessionInfo {
  playerSubject: string;
  kind: SessionKind;
  email?: string;
}
