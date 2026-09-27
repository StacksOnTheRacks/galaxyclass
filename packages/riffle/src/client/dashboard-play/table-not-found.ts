export const TABLE_NOT_FOUND_TITLE = "Couldn't open this table";
export const TABLE_NOT_FOUND_BODY =
  'This table link is invalid or unavailable. There is no list of other tables.';

export function renderTableNotFound(root: HTMLElement): void {
  root.replaceChildren();
  root.dataset.surface = 'table-not-found';
  delete root.dataset.breakpoint;

  const panel = document.createElement('section');
  panel.className = 'surface surface-table-not-found';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-live', 'assertive');

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = TABLE_NOT_FOUND_TITLE;

  const message = document.createElement('p');
  message.className = 'surface-message';
  message.textContent = TABLE_NOT_FOUND_BODY;

  panel.append(title, message);
  root.append(panel);
}
