import { createIcon } from '../dashboard/assets.js';
import { publicBase } from '../dashboard/public-base.js';
import type { TableListing } from './config.js';
import type { StudioAccount } from './studio-account.js';

function inertButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.setAttribute('aria-disabled', 'true');
  button.tabIndex = -1;
  return button;
}

function inertIconButton(className: string, iconName: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-disabled', 'true');
  button.tabIndex = -1;
  button.append(createIcon(iconName, 'table-list-icon'));
  return button;
}

function renderSeatBar(maxSeats: number): HTMLElement {
  const seats = document.createElement('div');
  seats.className = 'table-list-seat-bar';
  seats.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < maxSeats; index += 1) {
    const seat = document.createElement('span');
    seat.className = 'table-list-seat table-list-seat-open';
    seats.append(seat);
  }
  return seats;
}

function renderTableRow(table: TableListing): HTMLElement {
  const row = document.createElement('article');
  row.className = 'table-list-row';
  row.dataset.tableId = table.id;

  const tableCol = document.createElement('div');
  tableCol.className = 'table-list-col table-list-col-table';
  const name = document.createElement('p');
  name.className = 'table-list-row-title';
  name.textContent = table.name;
  const meta = document.createElement('p');
  meta.className = 'table-list-row-meta';
  meta.textContent = `${table.hostLabel} · ${table.variantLabel}`;
  tableCol.append(name, meta);

  const stakesCol = document.createElement('div');
  stakesCol.className = 'table-list-col table-list-col-stakes';
  const blinds = document.createElement('p');
  blinds.className = 'table-list-row-title';
  blinds.textContent = table.blindsLabel;
  const buyIn = document.createElement('p');
  buyIn.className = 'table-list-row-meta';
  buyIn.textContent = table.buyInLabel;
  stakesCol.append(blinds, buyIn);

  const playersCol = document.createElement('div');
  playersCol.className = 'table-list-col table-list-col-players';
  const count = document.createElement('p');
  count.className = 'table-list-player-count';
  count.textContent = `0 / ${table.maxSeats}`;
  playersCol.append(count, renderSeatBar(table.maxSeats));

  const actionCol = document.createElement('div');
  actionCol.className = 'table-list-col table-list-col-action';
  const join = document.createElement('a');
  join.className = 'table-list-join-button';
  join.href = `${publicBase()}/${table.id}`;
  join.textContent = 'Join';
  actionCol.append(join);

  row.append(tableCol, stakesCol, playersCol, actionCol);
  return row;
}

function renderTableCard(table: TableListing): HTMLElement {
  const card = document.createElement('article');
  card.className = 'table-list-card';
  card.dataset.tableId = table.id;

  const header = document.createElement('div');
  header.className = 'table-list-card-header';
  const name = document.createElement('p');
  name.className = 'table-list-row-title';
  name.textContent = table.name;
  const meta = document.createElement('p');
  meta.className = 'table-list-row-meta';
  meta.textContent = `${table.hostLabel} · ${table.variantLabel}`;
  header.append(name, meta);

  const stakes = document.createElement('div');
  stakes.className = 'table-list-card-stakes';
  const blinds = document.createElement('p');
  blinds.className = 'table-list-row-title';
  blinds.textContent = table.blindsLabel;
  const buyIn = document.createElement('p');
  buyIn.className = 'table-list-row-meta';
  buyIn.textContent = table.buyInLabel;
  stakes.append(blinds, buyIn);

  const players = document.createElement('div');
  players.className = 'table-list-card-players';
  const count = document.createElement('p');
  count.className = 'table-list-player-count';
  count.textContent = `0 / ${table.maxSeats} seated`;
  players.append(count, renderSeatBar(table.maxSeats));

  const join = document.createElement('a');
  join.className = 'table-list-join-button table-list-join-button-block';
  join.href = `${publicBase()}/${table.id}`;
  join.textContent = 'Join';

  card.append(header, stakes, players, join);
  return card;
}

function renderTopBar(openCount: number, account: StudioAccount | null): HTMLElement {
  const topBar = document.createElement('header');
  topBar.className = 'table-list-top-bar';

  const identity = document.createElement('div');
  identity.className = 'table-list-identity';
  const wordmark = document.createElement('p');
  wordmark.className = 'table-list-wordmark';
  wordmark.textContent = 'riffle';
  const divider = document.createElement('span');
  divider.className = 'table-list-divider';
  divider.setAttribute('aria-hidden', 'true');
  const nav = document.createElement('p');
  nav.className = 'table-list-nav-label';
  nav.textContent = 'Tables';
  const status = document.createElement('p');
  status.className = 'table-list-status-pill';
  status.textContent = `${openCount} open`;
  identity.append(wordmark, divider, nav, status);

  const controls = document.createElement('div');
  controls.className = 'table-list-controls';
  const playingAs = document.createElement('div');
  playingAs.className = 'table-list-playing-as';
  playingAs.dataset.account = account ? 'signed-in' : 'guest';
  const avatar = document.createElement('span');
  avatar.className = 'table-list-guest-avatar';
  avatar.textContent = account ? account.email.charAt(0).toUpperCase() : 'G';
  avatar.setAttribute('aria-hidden', 'true');
  const label = document.createElement('div');
  label.className = 'table-list-playing-as-label';
  const labelTop = document.createElement('p');
  labelTop.textContent = 'Playing as';
  const labelName = document.createElement('p');
  labelName.className = 'table-list-playing-as-name';
  labelName.textContent = account ? account.email : 'Guest';
  label.append(labelTop, labelName);
  playingAs.append(avatar, label);
  controls.append(playingAs, inertIconButton('table-list-settings-button', 'settings', 'Settings'));

  topBar.append(identity, controls);
  return topBar;
}

function renderHeading(signedIn: boolean): HTMLElement {
  const heading = document.createElement('section');
  heading.className = 'table-list-heading';

  const titleBlock = document.createElement('div');
  titleBlock.className = 'table-list-title-block';
  const title = document.createElement('h1');
  title.className = 'table-list-title';
  title.textContent = 'Open tables';
  const subtitle = document.createElement('p');
  subtitle.className = 'table-list-subtitle';
  subtitle.textContent = signedIn
    ? 'Pick a table and take a seat.'
    : "Pick a table and take a seat — no sign-up needed, you'll play as a guest.";
  titleBlock.append(title, subtitle);

  heading.append(titleBlock, inertButton('Join with a link', 'table-list-secondary-button table-list-join-link-desktop'));
  return heading;
}

function renderToolbar(): HTMLElement {
  const toolbar = document.createElement('section');
  toolbar.className = 'table-list-toolbar';
  toolbar.setAttribute('aria-label', 'Table filters');

  const search = document.createElement('div');
  search.className = 'table-list-search';
  search.append(createIcon('search', 'table-list-icon'));
  const searchLabel = document.createElement('span');
  searchLabel.textContent = 'Search tables or hosts';
  search.append(searchLabel);

  const filters = document.createElement('div');
  filters.className = 'table-list-filters';
  filters.append(
    inertButton('All tables', 'table-list-filter table-list-filter-active'),
    inertButton('Seats open', 'table-list-filter'),
    inertButton('Micro stakes', 'table-list-filter'),
    inertButton('Heads-up', 'table-list-filter'),
  );

  const sort = document.createElement('div');
  sort.className = 'table-list-sort';
  const sortPrefix = document.createElement('span');
  sortPrefix.textContent = 'Sort by';
  const sortValue = document.createElement('span');
  sortValue.className = 'table-list-sort-value';
  sortValue.textContent = 'Most players';
  sort.append(sortPrefix, sortValue, createIcon('chevron-down', 'table-list-icon'));

  toolbar.append(search, filters, sort);
  return toolbar;
}

function renderDesktopList(tables: TableListing[]): HTMLElement {
  const list = document.createElement('section');
  list.className = 'table-list-panel table-list-panel-desktop';
  list.setAttribute('aria-label', 'Open tables');

  const header = document.createElement('div');
  header.className = 'table-list-header-row';
  for (const label of ['Table', 'Stakes', 'Players']) {
    const cell = document.createElement('p');
    cell.className = 'table-list-header-cell';
    cell.textContent = label;
    header.append(cell);
  }
  const actionHeader = document.createElement('span');
  actionHeader.className = 'table-list-header-action';
  actionHeader.setAttribute('aria-hidden', 'true');
  header.append(actionHeader);

  list.append(header);
  for (const table of tables) {
    list.append(renderTableRow(table));
  }
  return list;
}

function renderResponsiveList(tables: TableListing[]): HTMLElement {
  const grid = document.createElement('section');
  grid.className = 'table-list-grid';
  grid.setAttribute('aria-label', 'Open tables');
  for (const table of tables) {
    grid.append(renderTableCard(table));
  }

  const joinPanel = document.createElement('section');
  joinPanel.className = 'table-list-join-panel';
  const joinTitle = document.createElement('h2');
  joinTitle.className = 'table-list-join-panel-title';
  joinTitle.textContent = 'Join with link';
  const joinCopy = document.createElement('p');
  joinCopy.className = 'table-list-join-panel-copy';
  joinCopy.textContent = 'Paste a table link to jump straight to a seat.';
  joinPanel.append(joinTitle, joinCopy, inertButton('Join with a link', 'table-list-secondary-button table-list-join-link-tablet'));

  const wrapper = document.createElement('div');
  wrapper.className = 'table-list-responsive';
  wrapper.append(grid, joinPanel);
  return wrapper;
}

export function renderTableList(
  root: HTMLElement,
  tables: TableListing[],
  account: StudioAccount | null = null,
): void {
  root.replaceChildren();
  root.dataset.surface = 'table-list';
  delete root.dataset.breakpoint;

  const page = document.createElement('div');
  page.className = 'table-list-page';

  page.append(
    renderTopBar(tables.length, account),
    renderHeading(account !== null),
    renderToolbar(),
    renderDesktopList(tables),
    renderResponsiveList(tables),
  );

  root.append(page);
}
