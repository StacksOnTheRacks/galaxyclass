import { createBrandLockup, createCardImage } from '../dashboard/assets.js';
import {
  galaxyClassAccountUrl,
  galaxyClassAvatarUrl,
  galaxyClassLibraryUrl,
} from '../dashboard/galaxy-class.js';
import { publicBase } from '../dashboard/public-base.js';
import type { TableListing } from './config.js';
import type { OccupancyById } from './list-occupancy.js';
import type { StudioAccount } from './studio-account.js';

const CHIP_TONES = ['red', 'black', 'blue', 'green', 'gold'] as const;

type TableStatus = 'waiting' | 'open';

const STATUS_LABELS: Record<TableStatus, string> = {
  waiting: 'Waiting for players',
  open: 'Players seated',
};

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

function groupOccupancy(
  table: TableListing,
  occupancy: OccupancyById,
): { seatedCount: number; tableCount: number; nextTableSeated: number } {
  const row = occupancy[table.id];
  if (!row) {
    return { seatedCount: 0, tableCount: 1, nextTableSeated: 0 };
  }
  const seatedCount = Number.isInteger(row.seatedCount) && row.seatedCount > 0 ? row.seatedCount : 0;
  const tableCount = Number.isInteger(row.tableCount) && row.tableCount > 0 ? row.tableCount : 0;
  const next = Number.isInteger(row.nextTableSeated) && row.nextTableSeated > 0 ? row.nextTableSeated : 0;
  return {
    seatedCount,
    tableCount,
    nextTableSeated: Math.min(next, table.maxSeats),
  };
}

function playersLabel(seatedCount: number, tableCount: number): string {
  const tables = tableCount === 1 ? 'table' : 'tables';
  return `${seatedCount} playing · ${tableCount} ${tables}`;
}

function tableStatus(seatedCount: number): TableStatus {
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

function renderTableRow(table: TableListing, occupancy: OccupancyById): HTMLElement {
  const { seatedCount, tableCount, nextTableSeated } = groupOccupancy(table, occupancy);
  const status = tableStatus(seatedCount);
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
  tableCol.append(renderMiniTable(table.maxSeats, nextTableSeated), identity);

  const playersCol = document.createElement('div');
  playersCol.className = 'table-list-col table-list-col-players';
  const count = textElement('p', 'table-list-player-count', playersLabel(seatedCount, tableCount));
  count.setAttribute('aria-label', playersLabel(seatedCount, tableCount));
  playersCol.append(count, renderStatusBadge(status));

  const actionCol = document.createElement('div');
  actionCol.className = 'table-list-col table-list-col-action';
  actionCol.append(renderJoin(table, 'table-list-join-button'));

  row.append(tableCol, renderStakes(table, 'table-list-col table-list-col-stakes'), playersCol, actionCol);
  return row;
}

function renderTableCard(table: TableListing, occupancy: OccupancyById): HTMLElement {
  const { seatedCount, tableCount, nextTableSeated } = groupOccupancy(table, occupancy);
  const status = tableStatus(seatedCount);
  const card = document.createElement('article');
  card.className = 'table-list-card';
  card.dataset.tableId = table.id;
  card.dataset.status = status;

  const stage = document.createElement('div');
  stage.className = 'table-list-card-stage';
  stage.append(renderMiniTable(table.maxSeats, nextTableSeated), renderStatusBadge(status));

  const header = document.createElement('div');
  header.className = 'table-list-card-header';
  header.append(
    renderTableName(table, 'card'),
    textElement('p', 'table-list-row-meta', `${table.hostLabel} · ${table.variantLabel}`),
  );

  const players = document.createElement('div');
  players.className = 'table-list-card-players';
  players.append(
    textElement('p', 'table-list-player-count', playersLabel(seatedCount, tableCount)),
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
  controls.append(renderPlayingAs(account));

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

function renderHero(playingCount: number, signedIn: boolean): HTMLElement {
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
  const status = textElement('p', 'table-list-status-pill', `${playingCount} playing`);
  titleRow.append(title, status);
  const subtitle = textElement(
    'p',
    'table-list-subtitle',
    signedIn
      ? "Pick a table and take a seat. No-Limit Hold'em, dealt live."
      : "Pick a table and take a seat — no sign-up needed, you'll play as a guest.",
  );
  titleBlock.append(titleRow, subtitle);

  hero.append(brand, titleBlock, renderHeroArt());
  return hero;
}

function renderDesktopList(tables: TableListing[], occupancy: OccupancyById): HTMLElement {
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

function renderResponsiveList(tables: TableListing[], occupancy: OccupancyById): HTMLElement {
  const grid = document.createElement('section');
  grid.className = 'table-list-grid';
  grid.setAttribute('aria-label', 'Open tables');
  for (const table of tables) {
    grid.append(renderTableCard(table, occupancy));
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'table-list-responsive';
  wrapper.append(grid);
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
  occupancy: OccupancyById = {},
): void {
  root.replaceChildren();
  root.dataset.surface = 'table-list';
  delete root.dataset.breakpoint;
  delete root.dataset.loading;
  root.removeAttribute('aria-busy');

  const playing = tables.reduce((sum, table) => sum + groupOccupancy(table, occupancy).seatedCount, 0);
  const page = createPage();
  page.append(renderTopBar(account), renderHero(playing, account !== null));

  if (tables.length === 0) {
    page.append(renderEmptyState());
  } else {
    page.append(renderDesktopList(tables, occupancy), renderResponsiveList(tables, occupancy));
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
