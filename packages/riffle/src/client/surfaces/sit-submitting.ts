export interface SitSubmittingContext {
  matchId: string;
}

export function renderSitSubmitting(root: HTMLElement, context: SitSubmittingContext): void {
  root.replaceChildren();
  root.dataset.surface = 'sit-submitting';
  root.dataset.matchId = context.matchId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-sit-submitting';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Taking your seat');

  const status = document.createElement('p');
  status.className = 'sit-submitting-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Taking your seat…';

  shell.append(status);
  root.append(shell);
}
