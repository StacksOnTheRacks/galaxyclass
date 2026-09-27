import './identity.css';
import {
  renderEntryPage,
  renderSignedInPage,
  renderSignInPage,
  renderSignUpPage,
} from './identity/render.js';
import {
  clearStoredSession,
  identityAuthHeaders,
  readStoredSession,
  writeStoredSession,
} from './identity/session.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IssueResponse {
  bearer: string;
  playerSubject: string;
}

interface SessionResponse {
  playerSubject: string;
  kind: 'account' | 'anonymous';
  email?: string;
}

function mountRoot(): HTMLElement {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Missing #app root');
  }
  return root;
}

function setHtml(root: HTMLElement, html: string): void {
  root.innerHTML = html;
}

function isValidEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  return email.length > 0 && EMAIL_PATTERN.test(email);
}

async function fetchSession(): Promise<SessionResponse | undefined> {
  const response = await fetch('/v1/identity/session', {
    headers: identityAuthHeaders(),
  });
  if (!response.ok) {
    return undefined;
  }
  return (await response.json()) as SessionResponse;
}

async function persistIssue(result: IssueResponse, kind?: SessionResponse['kind'], email?: string): Promise<void> {
  writeStoredSession({
    bearer: result.bearer,
    playerSubject: result.playerSubject,
    kind,
    email,
  });
  window.location.assign('/');
}

async function issueAnonymous(): Promise<void> {
  const response = await fetch('/v1/identity/anonymous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    return;
  }
  const body = (await response.json()) as IssueResponse;
  await persistIssue(body, 'anonymous');
}

async function signOut(): Promise<void> {
  await fetch('/v1/identity/sign-out', {
    method: 'POST',
    headers: identityAuthHeaders(),
  });
  clearStoredSession();
  window.location.assign('/');
}

function wireEntry(root: HTMLElement): void {
  root.querySelector('#identity-play-without-account')?.addEventListener('click', () => {
    void issueAnonymous();
  });
}

function wireSignedIn(root: HTMLElement): void {
  root.querySelector('#identity-sign-out')?.addEventListener('click', () => {
    void signOut();
  });
}

function wireSignIn(root: HTMLElement): void {
  const form = root.querySelector('#identity-sign-in-form') as HTMLFormElement | null;
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSignIn(root, form);
  });
}

async function handleSignIn(root: HTMLElement, form: HTMLFormElement): Promise<void> {
  const emailInput = form.querySelector('#sign-in-email') as HTMLInputElement;
  const passwordInput = form.querySelector('#sign-in-password') as HTMLInputElement;
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!isValidEmail(email)) {
    setHtml(root, renderSignInPage({ email, emailError: 'Enter a valid email address.' }));
    wireSignIn(root);
    return;
  }

  setHtml(root, renderSignInPage({ email, submitting: true }));
  wireSignIn(root);

  const response = await fetch('/v1/identity/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (response.ok) {
    const body = (await response.json()) as IssueResponse;
    await persistIssue(body, 'account', email.trim().toLowerCase());
    return;
  }

  setHtml(
    root,
    renderSignInPage({
      email,
      formError: 'Incorrect email or password.',
    }),
  );
  wireSignIn(root);
}

function wireSignUp(root: HTMLElement): void {
  const form = root.querySelector('#identity-sign-up-form') as HTMLFormElement | null;
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSignUp(root, form);
  });
}

async function handleSignUp(root: HTMLElement, form: HTMLFormElement): Promise<void> {
  const emailInput = form.querySelector('#sign-up-email') as HTMLInputElement;
  const passwordInput = form.querySelector('#sign-up-password') as HTMLInputElement;
  const confirmInput = form.querySelector('#sign-up-confirm-password') as HTMLInputElement;
  const email = emailInput.value;
  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;

  if (!isValidEmail(email)) {
    setHtml(root, renderSignUpPage({ email, emailError: 'Enter a valid email address.' }));
    wireSignUp(root);
    return;
  }

  if (password !== confirmPassword) {
    setHtml(
      root,
      renderSignUpPage({
        email,
        passwordError: 'Passwords must match.',
        confirmPasswordError: 'Passwords must match.',
      }),
    );
    wireSignUp(root);
    return;
  }

  setHtml(root, renderSignUpPage({ email, submitting: true }));
  wireSignUp(root);

  const response = await fetch('/v1/identity/sign-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (response.ok) {
    const body = (await response.json()) as IssueResponse;
    await persistIssue(body, 'account', email.trim().toLowerCase());
    return;
  }

  setHtml(
    root,
    renderSignUpPage({
      email,
      formError: 'Could not create account. Try again.',
    }),
  );
  wireSignUp(root);
}

async function bootstrapIdentity(): Promise<void> {
  const root = mountRoot();
  const path = window.location.pathname;

  if (path === '/sign-in') {
    setHtml(root, renderSignInPage());
    wireSignIn(root);
    return;
  }

  if (path === '/sign-up') {
    setHtml(root, renderSignUpPage());
    wireSignUp(root);
    return;
  }

  const stored = readStoredSession();
  if (stored) {
    const session = await fetchSession();
    if (session) {
      setHtml(root, renderSignedInPage({ kind: session.kind, email: session.email }));
      wireSignedIn(root);
      return;
    }
    clearStoredSession();
  }

  setHtml(root, renderEntryPage());
  wireEntry(root);
}

void bootstrapIdentity();
