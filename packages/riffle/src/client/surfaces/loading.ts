export type LoadingCopy = 'bootstrap' | 'shared';

export function renderLoading(
  root: HTMLElement,
  options?: { copy?: LoadingCopy },
): void {
  const copy = options?.copy ?? 'bootstrap';
  root.replaceChildren();
  root.dataset.surface = 'loading';

  const panel = document.createElement('section');
  panel.className = 'surface surface-loading';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-busy', 'true');
  panel.setAttribute(
    'aria-label',
    copy === 'shared' ? 'Loading table' : 'Connecting to your table',
  );

  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = copy === 'shared' ? 'Loading table…' : 'Joining table';

  const message = document.createElement('p');
  message.className = 'surface-message';
  message.textContent =
    copy === 'shared' ? 'Opening play link · no actions yet' : 'Securing your seat…';

  panel.append(spinner, title, message);
  root.append(panel);
}
