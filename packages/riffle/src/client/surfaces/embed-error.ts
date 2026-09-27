export type EmbedErrorReason =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'already_used'
  | 'invalid_session'
  | 'attach_failed'
  | 'match_not_found';

const REASON_COPY: Record<EmbedErrorReason, string> = {
  missing_token: 'No bootstrap token was provided.',
  invalid_token: 'This join link is not valid.',
  expired_token: 'This join link has expired. Ask your host for a new link.',
  already_used: 'This join link was already used.',
  invalid_session: 'Your session is no longer valid. Ask your host for a new link.',
  attach_failed: 'We could not attach you to the table.',
  match_not_found:
    'This play link is invalid, expired, or unavailable. Return to the host room and reopen the table from there. This is not a Riffle login.',
};

export function renderEmbedError(root: HTMLElement, reason: EmbedErrorReason): void {
  root.replaceChildren();
  root.dataset.surface = 'embed-error';

  const panel = document.createElement('section');
  panel.className = 'surface surface-embed-error';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-live', 'assertive');
  panel.setAttribute(
    'aria-label',
    reason === 'match_not_found' ? "Couldn't open this table" : 'Unable to join table',
  );

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = reason === 'match_not_found' ? "Couldn't open this table" : 'Unable to join';

  const message = document.createElement('p');
  message.className = 'surface-message';
  message.textContent = REASON_COPY[reason] ?? REASON_COPY.attach_failed;

  panel.append(title, message);

  if (reason !== 'match_not_found') {
    const hint = document.createElement('p');
    hint.className = 'surface-hint';
    hint.textContent = 'Close this frame and request a fresh link from your host.';
    panel.append(hint);
  }

  root.append(panel);
}
