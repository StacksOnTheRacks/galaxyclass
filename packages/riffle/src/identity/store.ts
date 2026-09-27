import { isValidEmail, normalizeEmail } from './email.js';
import { identityError, type IdentityErrorBody } from './errors.js';
import { hashPassword, isValidPassword, verifyPassword } from './password.js';
import {
  generateAnonymousJti,
  generateBearer,
  generateOpaqueId,
} from './tokens.js';
import type { IssueSessionResult, SessionInfo, SessionRecord } from './types.js';

export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; body: IdentityErrorBody };

export class IdentityStore {
  private readonly accountsByEmail = new Map<string, { id: string; passwordHash: string }>();
  private readonly accountsById = new Map<string, { email: string; passwordHash: string }>();
  private readonly sessions = new Map<string, SessionRecord>();

  async signUp(emailRaw: string, password: string): Promise<StoreResult<IssueSessionResult>> {
    if (!isValidEmail(emailRaw)) {
      return {
        ok: false,
        status: 400,
        body: identityError('invalid_email', 'Enter a valid email address.'),
      };
    }
    if (!isValidPassword(password)) {
      return {
        ok: false,
        status: 400,
        body: identityError('invalid_password', 'Password must be 8–128 characters.'),
      };
    }

    const email = normalizeEmail(emailRaw);
    if (this.accountsByEmail.has(email)) {
      return {
        ok: false,
        status: 409,
        body: identityError('email_taken', 'Could not create account. Try again.'),
      };
    }

    const accountId = generateOpaqueId('acct_');
    const passwordHash = await hashPassword(password);
    this.accountsByEmail.set(email, { id: accountId, passwordHash });
    this.accountsById.set(accountId, { email, passwordHash });

    return { ok: true, value: this.createAccountSession(accountId, email) };
  }

  async signIn(emailRaw: string, password: string): Promise<StoreResult<IssueSessionResult>> {
    if (!isValidEmail(emailRaw)) {
      return {
        ok: false,
        status: 400,
        body: identityError('invalid_email', 'Enter a valid email address.'),
      };
    }
    if (!isValidPassword(password)) {
      return {
        ok: false,
        status: 401,
        body: identityError('invalid_credentials', 'Incorrect email or password.'),
      };
    }

    const email = normalizeEmail(emailRaw);
    const account = this.accountsByEmail.get(email);
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      return {
        ok: false,
        status: 401,
        body: identityError('invalid_credentials', 'Incorrect email or password.'),
      };
    }

    return { ok: true, value: this.createAccountSession(account.id, email) };
  }

  issueAnonymous(): IssueSessionResult {
    const jti = generateAnonymousJti();
    const bearer = generateBearer();
    const playerSubject = `anon:${jti}`;

    this.sessions.set(bearer, {
      bearer,
      playerSubject,
      kind: 'anonymous',
    });

    return { bearer, playerSubject };
  }

  getSession(bearer: string): SessionInfo | undefined {
    const session = this.sessions.get(bearer);
    if (!session) {
      return undefined;
    }
    return {
      playerSubject: session.playerSubject,
      kind: session.kind,
      email: session.email,
    };
  }

  signOut(bearer: string): boolean {
    return this.sessions.delete(bearer);
  }

  private createAccountSession(accountId: string, email: string): IssueSessionResult {
    const bearer = generateBearer();
    const playerSubject = accountId;

    this.sessions.set(bearer, {
      bearer,
      playerSubject,
      kind: 'account',
      accountId,
      email,
    });

    return { bearer, playerSubject };
  }
}

export function createIdentityStore(): IdentityStore {
  return new IdentityStore();
}
