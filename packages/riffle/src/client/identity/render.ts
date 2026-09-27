export type IdentitySurface =
  | 'entry'
  | 'signed-in'
  | 'sign-in'
  | 'sign-up';

export interface SignedInContext {
  kind: 'account' | 'anonymous';
  email?: string;
}

function shell(content: string, surface: IdentitySurface): string {
  return `<div class="identity-shell surface" data-surface="${surface}">${content}</div>`;
}

function headerChrome(signedIn: boolean): string {
  if (signedIn) {
    return `<header class="identity-header"><span class="identity-brand">Riffle Poker</span></header>`;
  }
  return `<header class="identity-header">
    <span class="identity-brand">Riffle Poker</span>
    <nav class="identity-nav" aria-label="Account">
      <a class="identity-link" href="/sign-in">Sign in</a>
      <a class="identity-link identity-link-accent" href="/sign-up">Create account</a>
    </nav>
  </header>`;
}

export function renderEntryPage(): string {
  return shell(
    `${headerChrome(false)}
    <main class="identity-main">
      <h1 class="surface-title">Play poker on Riffle</h1>
      <p class="surface-copy">Choose how you want to start.</p>
      <div class="identity-actions">
        <a class="identity-button identity-button-primary" href="/sign-in">Sign in</a>
        <a class="identity-button" href="/sign-up">Create account</a>
        <button type="button" class="identity-button identity-button-text" id="identity-play-without-account">Play without account</button>
      </div>
    </main>`,
    'entry',
  );
}

export function renderSignedInPage(context: SignedInContext): string {
  const detail =
    context.kind === 'account' && context.email
      ? `<p class="identity-signed-in-email">${escapeText(context.email)}</p>`
      : '';
  return shell(
    `${headerChrome(true)}
    <main class="identity-main">
      <h1 class="surface-title">Signed in</h1>
      ${detail}
      <p class="surface-copy">You are ready to play when a table is available.</p>
      <button type="button" class="identity-button" id="identity-sign-out">Sign out</button>
    </main>`,
    'signed-in',
  );
}

export function renderSignInPage(options?: {
  emailError?: string;
  formError?: string;
  submitting?: boolean;
  email?: string;
}): string {
  const emailError = options?.emailError
    ? `<p class="field-error" id="sign-in-email-error" role="alert">${escapeText(options.emailError)}</p>`
    : '';
  const emailDescribedBy = options?.emailError ? ' aria-describedby="sign-in-email-error"' : '';
  const formError = options?.formError
    ? `<div class="form-alert" role="alert" aria-live="assertive">${escapeText(options.formError)}</div>`
    : '';
  const submitLabel = options?.submitting ? 'Signing in…' : 'Sign in';
  const disabled = options?.submitting ? ' disabled' : '';

  return shell(
    `${headerChrome(false)}
    <main class="identity-main identity-form-main">
      <h1 class="surface-title">Sign in</h1>
      ${formError}
      <form class="identity-form" id="identity-sign-in-form" novalidate>
        <div class="field">
          <label class="field-label" for="sign-in-email">Email</label>
          <input class="field-input" id="sign-in-email" name="email" type="email" autocomplete="email" value="${escapeAttr(options?.email ?? '')}"${emailDescribedBy}${disabled} />
          ${emailError}
        </div>
        <div class="field">
          <label class="field-label" for="sign-in-password">Password</label>
          <input class="field-input" id="sign-in-password" name="password" type="password" autocomplete="current-password"${disabled} />
        </div>
        <button type="submit" class="identity-button identity-button-primary"${disabled}>${submitLabel}</button>
      </form>
    </main>`,
    'sign-in',
  );
}

export function renderSignUpPage(options?: {
  emailError?: string;
  passwordError?: string;
  confirmPasswordError?: string;
  formError?: string;
  submitting?: boolean;
  email?: string;
}): string {
  const emailError = options?.emailError
    ? `<p class="field-error" id="sign-up-email-error" role="alert">${escapeText(options.emailError)}</p>`
    : '';
  const passwordError = options?.passwordError
    ? `<p class="field-error" id="sign-up-password-error" role="alert">${escapeText(options.passwordError)}</p>`
    : '';
  const confirmPasswordError = options?.confirmPasswordError
    ? `<p class="field-error" id="sign-up-confirm-password-error" role="alert">${escapeText(options.confirmPasswordError)}</p>`
    : '';
  const emailDescribedBy = options?.emailError ? ' aria-describedby="sign-up-email-error"' : '';
  const passwordDescribedBy = options?.passwordError ? ' aria-describedby="sign-up-password-error"' : '';
  const confirmDescribedBy = options?.confirmPasswordError
    ? ' aria-describedby="sign-up-confirm-password-error"'
    : '';
  const formError = options?.formError
    ? `<div class="form-alert" role="alert" aria-live="assertive">${escapeText(options.formError)}</div>`
    : '';
  const submitLabel = options?.submitting ? 'Creating account…' : 'Create account';
  const disabled = options?.submitting ? ' disabled' : '';

  return shell(
    `${headerChrome(false)}
    <main class="identity-main identity-form-main">
      <h1 class="surface-title">Create account</h1>
      ${formError}
      <form class="identity-form" id="identity-sign-up-form" novalidate>
        <div class="field">
          <label class="field-label" for="sign-up-email">Email</label>
          <input class="field-input" id="sign-up-email" name="email" type="email" autocomplete="email" value="${escapeAttr(options?.email ?? '')}"${emailDescribedBy}${disabled} />
          ${emailError}
        </div>
        <div class="field">
          <label class="field-label" for="sign-up-password">Password</label>
          <input class="field-input" id="sign-up-password" name="password" type="password" autocomplete="new-password"${passwordDescribedBy}${disabled} />
          ${passwordError}
        </div>
        <div class="field">
          <label class="field-label" for="sign-up-confirm-password">Confirm password</label>
          <input class="field-input" id="sign-up-confirm-password" name="confirmPassword" type="password" autocomplete="new-password"${confirmDescribedBy}${disabled} />
          ${confirmPasswordError}
        </div>
        <button type="submit" class="identity-button identity-button-primary"${disabled}>${submitLabel}</button>
      </form>
    </main>`,
    'sign-up',
  );
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeText(value);
}
