import { createBrandLockup, createCardImage, createIcon } from '../dashboard/assets.js';
import {
  galaxyClassAccountUrl,
  galaxyClassAvatarUrl,
  galaxyClassLibraryUrl,
} from '../dashboard/galaxy-class.js';
import { publicBase } from '../dashboard/public-base.js';
import type { TableListing } from './config.js';
import type { StudioAccount } from './studio-account.js';

const CHIP_TONES = ['red', 'black', 'blue', 'green', 'gold'] as const;

type TableStatus = 'waiting' | 'open' | 'full';

const STATUS_LABELS: Record<TableStatus, string> = {
  waiting: 'Waiting for players',
  open: 'Seats open',
  full: 'Table full',
};

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

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function seatedCountFor(table: TableListing, occupancy: Record<string, number>): number {
  const count = occupancy[table.id];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    return 0;
  }
  return Math.min(count, table.maxSeats);
}

function tableStatus(seatedCount: number, maxSeats: number): TableStatus {
  if (seatedCount >= maxSeats) {
    return 'full';
  }
  return seatedCount === 0 ? 'waiting' : 'open';
}

/** Chips sit on a rail around an oval of felt; filled seats are colored chips, open seats are dashed rings. */
function renderMiniTable(maxSeats: number, seatedCount: number): HTMLElement {
  const table = document.createElement('div');
  table.className = 'table-list-mini-table';
  table.setAttribute('aria-hidden', 'true');

  const felt = document.createElement('span');
  felt.className = 'table-list-mini-felt';
  const logo = document.createElement('span');
  logo.className = 'table-list-mini-felt-mark';
  felt.append(logo);

  const seats = document.createElement('div');
  seats.className = 'table-list-seat-bar';
  for (let index = 0; index < maxSeats; index += 1) {
    const seat = document.createElement('span');
    const filled = index < seatedCount;
    seat.className = filled
      ? 'table-list-seat table-list-seat-filled'
      : 'table-list-seat table-list-seat-open';
    if (filled) {
      seat.dataset.chip = CHIP_TONES[index % CHIP_TONES.length];
    }
    // Start at the bottom center (the hero seat) and deal clockwise.
    const angle = Math.PI / 2 + (index / maxSeats) * Math.PI * 2;
    seat.style.left = `${(50 + Math.cos(angle) * 50).toFixed(2)}%`;
    seat.style.top = `${(50 + Math.sin(angle) * 50).toFixed(2)}%`;
    seats.append(seat);
  }

  table.append(felt, seats);
  return table;
}

function renderStakes(table: TableListing, className: string): HTMLElement {
  const stakes = document.createElement('div');
  stakes.className = className;
  const blinds = document.createElement('p');
  blinds.className = 'table-list-row-title table-list-blinds';
  const chip = document.createElement('span');
  chip.className = 'table-list-stake-chip';
  chip.setAttribute('aria-hidden', 'true');
  const blindsLabel = document.createElement('span');
  blindsLabel.textContent = table.blindsLabel;
  const blindsHint = textElement('span', 'visually-hidden', ' blinds');
  blinds.append(chip, blindsLabel, blindsHint);
  stakes.append(blinds, textElement('p', 'table-list-row-meta', table.buyInLabel));
  return stakes;
}

function renderStatusBadge(status: TableStatus): HTMLElement {
  const badge = textElement('p', 'table-list-status-badge', STATUS_LABELS[status]);
  badge.dataset.status = status;
  return badge;
}

function renderJoin(table: TableListing, className: string): HTMLAnchorElement {
  const join = document.createElement('a');
  join.className = className;
  join.href = `${publicBase()}/${table.id}`;
  join.textContent = 'Join';
  join.setAttribute('aria-describedby', `table-name-${table.id}`);
  return join;
}

function renderTableName(table: TableListing, idSuffix: string): HTMLElement {
  const name = textElement('h2', 'table-list-row-title table-list-table-name', table.name);
  if (idSuffix === '') {
    name.id = `table-name-${table.id}`;
  }
  return name;
}

function renderTableRow(table: TableListing, occupancy: Record<string, number>): HTMLElement {
  const seatedCount = seatedCountFor(table, occupancy);
  const status = tableStatus(seatedCount, table.maxSeats);
  const row = document.createElement('article');
  row.className = 'table-list-row';
  row.dataset.tableId = table.id;
  row.dataset.status = status;
  row.setAttribute('aria-labelledby', `table-name-${table.id}`);

  const tableCol = document.createElement('div');
  tableCol.className = 'table-list-col table-list-col-table';
  const identity = document.createElement('div');
  identity.className = 'table-list-table-identity';
  identity.append(
    renderTableName(table, ''),
    textElement('p', 'table-list-row-meta', `${table.hostLabel} · ${table.variantLabel}`),
  );
  tableCol.append(renderMiniTable(table.maxSeats, seatedCount), identity);

  const playersCol = document.createElement('div');
  playersCol.className = 'table-list-col table-list-col-players';
  const count = textElement('p', 'table-list-player-count', `${seatedCount} / ${table.maxSeats}`);
  count.setAttribute('aria-label', `${seatedCount} of ${table.maxSeats} seats taken`);
  playersCol.append(count, renderStatusBadge(status));

  const actionCol = document.createElement('div');
  actionCol.className = 'table-list-col table-list-col-action';
  actionCol.append(renderJoin(table, 'table-list-join-button'));

  row.append(tableCol, renderStakes(table, 'table-list-col table-list-col-stakes'), playersCol, actionCol);
  return row;
}

function renderTableCard(table: TableListing, occupancy: Record<string, number>): HTMLElement {
  const seatedCount = seatedCountFor(table, occupancy);
  const status = tableStatus(seatedCount, table.maxSeats);
  const card = document.createElement('article');
  card.className = 'table-list-card';
  card.dataset.tableId = table.id;
  card.dataset.status = status;

  const stage = document.createElement('div');
  stage.className = 'table-list-card-stage';
  stage.append(renderMiniTable(table.maxSeats, seatedCount), renderStatusBadge(status));

  const header = document.createElement('div');
  header.className = 'table-list-card-header';
  header.append(
    renderTableName(table, 'card'),
    textElement('p', 'table-list-row-meta', `${table.hostLabel} · ${table.variantLabel}`),
  );

  const players = document.createElement('div');
  players.className = 'table-list-card-players';
  players.append(
    textElement('p', 'table-list-player-count', `${seatedCount} / ${table.maxSeats} seated`),
  );

  const details = document.createElement('div');
  details.className = 'table-list-card-details';
  details.append(renderStakes(table, 'table-list-card-stakes'), players);

  const join = renderJoin(table, 'table-list-join-button table-list-join-button-block');
  join.removeAttribute('aria-describedby');
  join.setAttribute('aria-label', `Join ${table.name}`);

  card.append(stage, header, details, join);
  return card;
}

function renderAvatar(account: StudioAccount | null): HTMLElement {
  let avatar: HTMLElement;
  if (account?.avatarId) {
    const image = document.createElement('img');
    image.className = 'table-list-guest-avatar table-list-account-avatar';
    image.src = galaxyClassAvatarUrl(account.avatarId);
    image.alt = '';
    image.decoding = 'async';
    avatar = image;
  } else {
    avatar = document.createElement('span');
    avatar.className = 'table-list-guest-avatar';
    avatar.textContent = account ? (account.gamerTag?.charAt(0).toUpperCase() ?? 'P') : 'G';
  }
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}

function renderPlayingAs(account: StudioAccount | null): HTMLElement {
  const playingAs = document.createElement('div');
  playingAs.className = 'table-list-playing-as';
  playingAs.dataset.account = account ? 'signed-in' : 'guest';
  const label = document.createElement('div');
  label.className = 'table-list-playing-as-label';
  const labelTop = document.createElement('p');
  labelTop.textContent = 'Playing as';
  const labelName = document.createElement('p');
  labelName.className = 'table-list-playing-as-name';
  if (account && !account.gamerTag) {
    const setTag = document.createElement('a');
    setTag.className = 'table-list-set-tag-link';
    setTag.href = galaxyClassAccountUrl();
    setTag.textContent = 'Set your gamer tag';
    labelName.append(setTag);
  } else {
    labelName.textContent = account?.gamerTag ?? 'Guest';
  }
  label.append(labelTop, labelName);
  playingAs.append(renderAvatar(account), label);
  return playingAs;
}

function renderLibraryLink(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'table-list-breadcrumb';
  nav.setAttribute('aria-label', 'Breadcrumb');
  const link = document.createElement('a');
  link.className = 'table-list-library-link';
  link.href = galaxyClassLibraryUrl();
  const arrow = textElement('span', 'table-list-library-arrow', '←');
  arrow.setAttribute('aria-hidden', 'true');
  link.append(arrow, 'Galaxy Class Library');
  nav.append(link);
  return nav;
}

function renderTopBar(account: StudioAccount | null): HTMLElement {
  const topBar = document.createElement('header');
  topBar.className = 'table-list-top-bar';

  const controls = document.createElement('div');
  controls.className = 'table-list-controls';
  controls.append(
    renderPlayingAs(account),
    inertIconButton('table-list-settings-button', 'settings', 'Settings'),
  );

  topBar.append(renderLibraryLink(), controls);
  return topBar;
}

/** Two real cards fanned over a short chip stack; purely decorative. */
function renderHeroArt(): HTMLElement {
  const art = document.createElement('div');
  art.className = 'table-list-hero-art';
  art.setAttribute('aria-hidden', 'true');
  const cards = document.createElement('div');
  cards.className = 'table-list-hero-cards';
  cards.append(
    createCardImage({ rank: 'A', suit: 'c' }, 'table-list-hero-card table-list-hero-card-back'),
    createCardImage({ rank: 'A', suit: 'd' }, 'table-list-hero-card table-list-hero-card-front'),
  );
  const stack = document.createElement('div');
  stack.className = 'table-list-hero-chips';
  for (const tone of ['black', 'red', 'red', 'gold', 'blue']) {
    const chip = document.createElement('span');
    chip.className = 'table-list-hero-chip';
    chip.dataset.chip = tone;
    stack.append(chip);
  }
  art.append(stack, cards);
  return art;
}

function renderHero(openCount: number, signedIn: boolean): HTMLElement {
  const hero = document.createElement('section');
  hero.className = 'table-list-heading';
  hero.setAttribute('aria-labelledby', 'table-list-title');

  const brand = document.createElement('a');
  brand.className = 'table-list-brand';
  brand.href = `${publicBase()}/`;
  brand.append(createBrandLockup('table-list-lockup'));

  const titleBlock = document.createElement('div');
  titleBlock.className = 'table-list-title-block';
  const titleRow = document.createElement('div');
  titleRow.className = 'table-list-title-row';
  const title = textElement('h1', 'table-list-title', 'Open tables');
  title.id = 'table-list-title';
  const status = textElement('p', 'table-list-status-pill', `${openCount} open`);
  titleRow.append(title, status);
  const subtitle = textElement(
    'p',
    'table-list-subtitle',
    signedIn
      ? "Pick a table and take a seat. No-Limit Hold'em, dealt live."
      : "Pick a table and take a seat — no sign-up needed, you'll play as a guest.",
  );
  titleBlock.append(
    titleRow,
    subtitle,
    inertButton('Join with a link', 'table-list-secondary-button table-list-join-link-desktop'),
  );

  hero.append(brand, titleBlock, renderHeroArt());
  return hero;
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

function renderDesktopList(tables: TableListing[], occupancy: Record<string, number>): HTMLElement {
  const list = document.createElement('section');
  list.className = 'table-list-panel table-list-panel-desktop';
  list.setAttribute('aria-label', 'Open tables');

  const header = document.createElement('div');
  header.className = 'table-list-header-row';
  header.setAttribute('aria-hidden', 'true');
  for (const label of ['Table', 'Stakes', 'Players']) {
    header.append(textElement('p', 'table-list-header-cell', label));
  }
  const actionHeader = document.createElement('span');
  actionHeader.className = 'table-list-header-action';
  header.append(actionHeader);

  list.append(header);
  for (const table of tables) {
    list.append(renderTableRow(table, occupancy));
  }
  return list;
}

function renderResponsiveList(tables: TableListing[], occupancy: Record<string, number>): HTMLElement {
  const grid = document.createElement('section');
  grid.className = 'table-list-grid';
  grid.setAttribute('aria-label', 'Open tables');
  for (const table of tables) {
    grid.append(renderTableCard(table, occupancy));
  }

  const joinPanel = document.createElement('section');
  joinPanel.className = 'table-list-join-panel';
  joinPanel.setAttribute('aria-labelledby', 'table-list-join-panel-title');
  const joinTitle = textElement('h2', 'table-list-join-panel-title', 'Join with link');
  joinTitle.id = 'table-list-join-panel-title';
  joinPanel.append(
    joinTitle,
    textElement('p', 'table-list-join-panel-copy', 'Paste a table link to jump straight to a seat.'),
    inertButton('Join with a link', 'table-list-secondary-button table-list-join-link-tablet'),
  );

  const wrapper = document.createElement('div');
  wrapper.className = 'table-list-responsive';
  wrapper.append(grid, joinPanel);
  return wrapper;
}

function renderEmptyState(): HTMLElement {
  const empty = document.createElement('section');
  empty.className = 'table-list-empty';
  empty.setAttribute('aria-labelledby', 'table-list-empty-title');

  const art = document.createElement('div');
  art.className = 'table-list-empty-art';
  art.setAttribute('aria-hidden', 'true');
  art.append(renderMiniTable(6, 0));

  const title = textElement('h2', 'table-list-empty-title', 'No tables are dealing right now');
  title.id = 'table-list-empty-title';
  const copy = textElement(
    'p',
    'table-list-empty-copy',
    'The dealer is shuffling up. Check back in a bit, or find another game in the library.',
  );
  const link = document.createElement('a');
  link.className = 'table-list-secondary-button table-list-empty-link';
  link.href = galaxyClassLibraryUrl();
  link.textContent = 'Browse the Galaxy Class Library';

  empty.append(art, title, copy, link);
  return empty;
}

function createPage(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'table-list-page';
  return page;
}

export function renderTableList(
  root: HTMLElement,
  tables: TableListing[],
  account: StudioAccount | null = null,
  occupancy: Record<string, number> = {},
): void {
  root.replaceChildren();
  root.dataset.surface = 'table-list';
  delete root.dataset.breakpoint;
  delete root.dataset.loading;
  root.removeAttribute('aria-busy');

  const page = createPage();
  page.append(renderTopBar(account), renderHero(tables.length, account !== null));

  if (tables.length === 0) {
    page.append(renderEmptyState());
  } else {
    page.append(
      renderToolbar(),
      renderDesktopList(tables, occupancy),
      renderResponsiveList(tables, occupancy),
    );
  }

  root.append(page);
}

/** Placeholder rows while the table config loads, so the page keeps its shape. */
export function renderTableListLoading(root: HTMLElement, account: StudioAccount | null = null): void {
  root.replaceChildren();
  root.dataset.surface = 'table-list';
  root.dataset.loading = 'true';
  delete root.dataset.breakpoint;

  const page = createPage();
  page.append(renderTopBar(account));

  const status = document.createElement('section');
  status.className = 'table-list-skeleton';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-busy', 'true');
  const brand = createBrandLockup('table-list-lockup table-list-skeleton-lockup');
  const label = textElement('p', 'table-list-skeleton-label', 'Shuffling up the tables…');
  const rows = document.createElement('div');
  rows.className = 'table-list-skeleton-rows';
  rows.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) {
    const row = document.createElement('div');
    row.className = 'table-list-skeleton-row';
    row.append(renderMiniTable(6, 0));
    for (const width of ['40%', '18%', '14%']) {
      const bar = document.createElement('span');
      bar.className = 'table-list-skeleton-bar';
      bar.style.width = width;
      row.append(bar);
    }
    rows.append(row);
  }
  status.append(brand, label, rows);
  page.append(status);
  root.append(page);
}
