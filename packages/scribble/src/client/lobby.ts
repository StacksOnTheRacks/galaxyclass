import { ACCOUNT_HINT_KEY, parseAccountHint } from '@galaxyclass/accounts/account-hint';
import { avatarUrl, isAvatarId } from '@galaxyclass/accounts/avatars';
import {
  galaxyClassSignInUrl,
  galaxyClassSignUpUrl,
  renderGameHeader,
  type GameHeaderAccount,
} from '@galaxyclass/accounts/game-header';
import { LETTER_VALUES } from '../rules/tiles.js';
import type { TableSummary } from '../runtime/types.js';
import type { ScribbleConfig } from './config.js';
import { accessTokenSource, type GetAccessToken } from './player-token.js';
import { publicBase, tablePath } from './route.js';
import { memberRequest, type MemberReply } from './session.js';

export interface LobbyDeps {
  getAccessToken: GetAccessToken;
  request(message: Record<string, unknown>): Promise<MemberReply | null>;
  /** Display-only profile the studio leaves in localStorage; the server's reply replaces it. */
  readHint(): GameHeaderAccount | null;
  /** Origin the share links point at. */
  origin: string;
  clipboard?: Pick<Clipboard, 'writeText'>;
  share?: (data: ShareData) => Promise<void>;
  confirm(text: string): boolean;
}

export function lobbyDeps(config: ScribbleConfig): LobbyDeps {
  return {
    getAccessToken: accessTokenSource(config, window.sessionStorage),
    request: (message) => memberRequest(config.webSocketUrl, message),
    readHint: () => {
      try {
        return parseAccountHint(window.localStorage.getItem(ACCOUNT_HINT_KEY));
      } catch {
        return null;
      }
    },
    origin: window.location.origin,
    ...(navigator.clipboard ? { clipboard: navigator.clipboard } : {}),
    ...(typeof navigator.share === 'function' ? { share: (data: ShareData) => navigator.share(data) } : {}),
    confirm: (text) => window.confirm(text),
  };
}

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) {
      node.append(child);
    }
  }
  return node;
}

function letterTile(letter: string | null, className = 'sl-tile'): HTMLElement {
  const upper = letter?.toUpperCase() ?? '';
  const value = upper ? LETTER_VALUES[upper] : undefined;
  return h(
    'span',
    { class: className, 'aria-hidden': 'true', 'data-blank': upper ? undefined : 'true' },
    h('span', { class: 'sl-tile-letter' }, upper),
    value !== undefined ? h('span', { class: 'sl-tile-value' }, String(value)) : null,
  );
}

function titleTiles(word: string): HTMLElement {
  const row = h('span', { class: 'sl-title-tiles', 'aria-hidden': 'true' });
  for (const letter of word) {
    row.append(letterTile(letter));
  }
  return row;
}

const STATUS_LABEL: Record<TableSummary['status'], string> = {
  waiting: 'Waiting for players',
  playing: 'Game in progress',
  ended: 'Game over',
};

function tableName(table: TableSummary): string {
  return table.tableName ?? 'Untitled table';
}

/** What the card's main button does for this member right now. */
export function primaryAction(table: TableSummary): { label: string; hint: string | null } {
  const seated = table.seats.some((seat) => seat.isYou);
  if (seated) {
    return { label: table.status === 'playing' ? 'Return to game' : 'Enter table', hint: null };
  }
  if (table.status === 'playing') {
    return { label: 'Watch game', hint: 'Seats are locked until this game ends.' };
  }
  if (table.seats.length >= table.maxSeats) {
    return { label: 'Watch table', hint: 'Every seat is taken.' };
  }
  return { label: 'Take a seat', hint: null };
}

function seatSummary(table: TableSummary): string {
  const parts = [`${table.seats.length} of ${table.maxSeats} seated`];
  if (table.gameNumber > 0) {
    parts.push(`Game ${table.gameNumber}`);
  }
  if (table.role === 'owner') {
    parts.push('You host');
  }
  return parts.join(' · ');
}

function seatIcon(kind: 'open' | 'locked'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', kind === 'locked' ? 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z' : 'M12 5v14M5 12h14');
  svg.append(path);
  return svg;
}

function renderRack(table: TableSummary): HTMLElement {
  const rack = h('ul', { class: 'sl-rack', 'aria-label': 'Seats' });
  for (let i = 0; i < table.maxSeats; i++) {
    const seat = table.seats[i];
    if (!seat) {
      const locked = table.status === 'playing';
      rack.append(
        h(
          'li',
          { class: 'sl-seat sl-seat-open', 'data-locked': locked ? 'true' : undefined },
          h('span', { class: 'sl-seat-avatar' }, seatIcon(locked ? 'locked' : 'open')),
          h('span', { class: 'sl-seat-name' }, locked ? 'Locked' : 'Open seat'),
        ),
      );
      continue;
    }
    const avatar = isAvatarId(seat.avatarId)
      ? h('img', { class: 'sl-seat-avatar', src: avatarUrl(seat.avatarId), alt: '', width: '40', height: '40', loading: 'lazy' })
      : h('span', { class: 'sl-seat-avatar', 'aria-hidden': 'true' }, seat.displayName.charAt(0).toUpperCase());
    const label = [seat.displayName, seat.isYou ? '(you)' : null, seat.away ? '(away)' : null].filter(Boolean).join(' ');
    rack.append(
      h(
        'li',
        {
          class: 'sl-seat',
          'data-you': seat.isYou ? 'true' : undefined,
          'data-away': seat.away ? 'true' : undefined,
          'aria-label': label,
        },
        avatar,
        h('span', { class: 'sl-seat-name', 'aria-hidden': 'true' }, seat.isYou ? 'You' : seat.displayName),
      ),
    );
  }
  return rack;
}

interface LobbyView {
  deps: LobbyDeps;
  accessToken: string;
  announce(text: string): void;
  list: HTMLUListElement;
  refreshEmpty(): void;
}

function inviteText(table: TableSummary): string {
  return `Join my Scribble table “${tableName(table)}” on Galaxy Class.`;
}

function renderCard(view: LobbyView, table: TableSummary): HTMLLIElement {
  const { deps } = view;
  const name = tableName(table);
  const base = `sl-card-${table.tableId}`;
  const link = `${deps.origin}${tablePath(table.tableId)}`;
  const action = primaryAction(table);
  const monogram = /[A-Za-z]/.exec(name)?.[0] ?? null;

  const linkField = h('input', {
    class: 'sl-invite-field',
    id: `${base}-link`,
    type: 'text',
    readonly: true,
    value: link,
    spellcheck: 'false',
  });
  linkField.addEventListener('focus', () => linkField.select());

  const copyLink = async (): Promise<void> => {
    try {
      if (!deps.clipboard) {
        throw new Error('no clipboard');
      }
      await deps.clipboard.writeText(link);
      view.announce(`Link to ${name} copied.`);
    } catch {
      openInvite(true);
      linkField.focus();
      view.announce('Copy the link from the invite box.');
    }
  };

  const invitePanel = h(
    'div',
    { class: 'sl-invite', id: `${base}-invite`, hidden: true },
    h('label', { class: 'sl-invite-label', for: `${base}-link` }, 'Invite link'),
    h('p', { class: 'sl-invite-note' }, 'Friends sign in with Galaxy Class, then take a seat before the game starts.'),
    linkField,
  );
  const inviteActions = h('div', { class: 'sl-invite-actions' });
  const copyInPanel = h('button', { type: 'button', class: 'sl-btn sl-btn-small' }, 'Copy');
  copyInPanel.addEventListener('click', () => void copyLink());
  const email = h(
    'a',
    {
      class: 'sl-btn sl-btn-small',
      href: `mailto:?subject=${encodeURIComponent(`Scribble: ${name}`)}&body=${encodeURIComponent(`${inviteText(table)}\n\n${link}`)}`,
    },
    'Email',
  );
  inviteActions.append(copyInPanel, email);
  if (deps.share) {
    const share = h('button', { type: 'button', class: 'sl-btn sl-btn-small' }, 'Share…');
    share.addEventListener('click', () => {
      void deps.share!({ title: `Scribble: ${name}`, text: inviteText(table), url: link }).catch(() => {});
    });
    inviteActions.append(share);
  }
  invitePanel.append(inviteActions);

  const inviteToggle = h(
    'button',
    { type: 'button', class: 'sl-btn sl-btn-ghost', 'aria-expanded': 'false', 'aria-controls': `${base}-invite` },
    'Invite friends',
  );
  const openInvite = (open: boolean) => {
    invitePanel.hidden = !open;
    inviteToggle.setAttribute('aria-expanded', String(open));
  };
  inviteToggle.addEventListener('click', () => openInvite(invitePanel.hidden));

  const copyButton = h('button', { type: 'button', class: 'sl-btn sl-btn-ghost' }, 'Copy link');
  copyButton.addEventListener('click', () => void copyLink());

  const hosting = table.role === 'owner';
  const remove = h(
    'button',
    { type: 'button', class: hosting ? 'sl-text-btn sl-text-btn-danger' : 'sl-text-btn' },
    hosting ? 'Delete table' : 'Remove from my tables',
  );
  const item = h('li', { class: 'sl-card-item', id: base });
  const dropCard = (announcement: string) => {
    const next = (item.nextElementSibling ?? item.previousElementSibling)?.querySelector<HTMLElement>('.sl-btn-primary');
    item.remove();
    view.refreshEmpty();
    view.announce(announcement);
    next?.focus();
  };
  remove.addEventListener('click', async () => {
    if (hosting) {
      const during = table.status === 'playing' ? ' The game in progress ends now.' : '';
      if (!deps.confirm(`Delete “${name}” for everyone?${during} Every seat and invite link stops working. This cannot be undone.`)) {
        return;
      }
      remove.disabled = true;
      const reply = await deps.request({ action: 'delete_table', accessToken: view.accessToken, tableId: table.tableId });
      if (reply?.type === 'table_deleted' || (reply?.type === 'error' && reply.code === 'table_not_found')) {
        dropCard(`${name} deleted.`);
        return;
      }
      remove.disabled = false;
      view.announce(`Could not delete ${name}. Try again.`);
      return;
    }
    const seated = table.seats.some((seat) => seat.isYou);
    const warning = seated ? ' You keep your seat, but you will need the link to get back.' : ' You can come back with its link.';
    if (!deps.confirm(`Remove “${name}” from your tables?${warning}`)) {
      return;
    }
    remove.disabled = true;
    const reply = await deps.request({ action: 'forget_table', accessToken: view.accessToken, tableId: table.tableId });
    if (reply?.type === 'table_forgotten') {
      dropCard(`${name} removed from your tables.`);
      return;
    }
    remove.disabled = false;
    view.announce(`Could not remove ${name}. Try again.`);
  });

  const card = h(
    'article',
    { class: 'sl-card', 'data-status': table.status, 'aria-labelledby': `${base}-name` },
    h(
      'div',
      { class: 'sl-card-top' },
      letterTile(monogram, 'sl-tile sl-card-monogram'),
      h(
        'div',
        { class: 'sl-card-heading' },
        h('h3', { class: 'sl-card-name', id: `${base}-name` }, name),
        h('p', { class: 'sl-card-meta' }, seatSummary(table)),
      ),
      h('span', { class: 'sl-badge', 'data-status': table.status }, STATUS_LABEL[table.status]),
    ),
    renderRack(table),
    action.hint ? h('p', { class: 'sl-card-hint' }, action.hint) : null,
    h(
      'div',
      { class: 'sl-actions' },
      h('a', { class: 'sl-btn sl-btn-primary', href: tablePath(table.tableId) }, action.label),
      copyButton,
      inviteToggle,
    ),
    invitePanel,
    h('div', { class: 'sl-card-footer' }, remove),
  );
  item.append(card);
  return item;
}

function hero(): HTMLElement {
  return h(
    'header',
    { class: 'sl-hero' },
    h('h1', { class: 'sl-title' }, h('span', { class: 'sr-only' }, 'Scribble'), titleTiles('SCRIBBLE')),
    h(
      'p',
      { class: 'sl-lede' },
      'Your word tables. Start one, send the link to friends, and play once everyone has a seat.',
    ),
  );
}

function shell(
  host: HTMLElement,
  account: GameHeaderAccount | null,
  returnTo = publicBase(),
): { page: HTMLElement; body: HTMLElement; setAccount(a: GameHeaderAccount | null): void } {
  const page = h('div', { class: 'sl-page' });
  const inner = h('div', { class: 'sl-inner' });
  const header = (a: GameHeaderAccount | null) => renderGameHeader({ account: a, guests: false, returnTo });
  let current = header(account);
  const body = h('main', { class: 'sl-main', id: 'main' });
  inner.append(current, body);
  page.append(inner);
  host.replaceChildren(page);
  return {
    page,
    body,
    setAccount(a) {
      const next = header(a);
      current.replaceWith(next);
      current = next;
    },
  };
}

function membersOnly(body: HTMLElement, note?: string): void {
  const returnTo = publicBase();
  body.replaceChildren(
    hero(),
    h(
      'section',
      { class: 'sl-panel sl-members', 'aria-labelledby': 'sl-members-heading' },
      letterTile('M', 'sl-tile sl-panel-tile'),
      h('h2', { id: 'sl-members-heading' }, 'Scribble is for Galaxy Class members'),
      h(
        'p',
        {},
        note ??
          'Sign in to see your tables, start a new one, and invite friends. Invite links work for anyone with a free Galaxy Class account.',
      ),
      h(
        'div',
        { class: 'sl-actions' },
        h('a', { class: 'sl-btn sl-btn-gold', href: galaxyClassSignInUrl(returnTo) }, 'Sign in'),
        h('a', { class: 'sl-btn sl-btn-ghost-light', href: galaxyClassSignUpUrl(returnTo) }, 'Create an account'),
      ),
    ),
  );
}

function skeletons(count: number): HTMLLIElement[] {
  return Array.from({ length: count }, () =>
    h('li', { class: 'sl-card-item', 'aria-hidden': 'true' }, h('div', { class: 'sl-card sl-card-skeleton' })),
  );
}

const ERROR_COPY: Record<string, string> = {
  table_limit: 'You already host 20 tables. Delete one to start another.',
  identity_unavailable: 'Sign-in checks are unavailable right now. Try again shortly.',
};

/** `/scribble`: a member's own tables, never a public lobby. */
export async function renderLobby(host: HTMLElement, config: ScribbleConfig, deps: LobbyDeps = lobbyDeps(config)): Promise<void> {
  document.title = 'Your tables · Scribble';
  const hint = deps.readHint();
  const ui = shell(host, hint);
  ui.body.setAttribute('aria-busy', 'true');
  ui.body.replaceChildren(hero(), h('ul', { class: 'sl-grid' }, ...skeletons(2)));

  const accessToken = await deps.getAccessToken();
  if (!accessToken) {
    ui.setAccount(null);
    ui.body.removeAttribute('aria-busy');
    membersOnly(ui.body);
    return;
  }

  const status = h('p', { class: 'sl-live', role: 'status', 'aria-live': 'polite' });
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = (text: string) => {
    status.textContent = text;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      status.textContent = '';
    }, 6000);
  };

  const list = h('ul', { class: 'sl-grid', 'aria-labelledby': 'sl-tables-heading' });
  const count = h('span', { class: 'sl-count' });
  const empty = h(
    'div',
    { class: 'sl-panel sl-empty', hidden: true },
    letterTile(null, 'sl-tile sl-panel-tile'),
    h('h3', {}, 'No tables yet'),
    h('p', {}, 'Name a table above to start one, or open an invite link a friend sent you.'),
  );
  const view: LobbyView = {
    deps,
    accessToken,
    announce,
    list,
    refreshEmpty() {
      const n = list.children.length;
      empty.hidden = n > 0;
      list.hidden = n === 0;
      count.textContent = n > 0 ? String(n) : '';
    },
  };

  const nameInput = h('input', {
    id: 'sl-new-name',
    name: 'tableName',
    type: 'text',
    maxlength: '40',
    autocomplete: 'off',
    placeholder: 'Friday word night',
    'aria-describedby': 'sl-new-help',
  });
  const createButton = h('button', { type: 'submit', class: 'sl-btn sl-btn-gold' }, 'Create table');
  const form = h(
    'form',
    { class: 'sl-panel sl-create', 'aria-labelledby': 'sl-new-heading' },
    h('h2', { id: 'sl-new-heading' }, 'Start a new table'),
    h(
      'div',
      { class: 'sl-create-row' },
      h('label', { class: 'sl-create-label', for: 'sl-new-name' }, 'Table name'),
      nameInput,
      createButton,
    ),
    h('p', { class: 'sl-create-help', id: 'sl-new-help' }, 'Up to four players. You get a link to share; seats lock when the game starts.'),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    createButton.disabled = true;
    createButton.textContent = 'Creating…';
    const reply = await deps.request({ action: 'create_table', accessToken, tableName: nameInput.value });
    createButton.disabled = false;
    createButton.textContent = 'Create table';
    if (reply?.type === 'table_created') {
      nameInput.value = '';
      const item = renderCard(view, reply.table);
      list.prepend(item);
      view.refreshEmpty();
      item.querySelector<HTMLButtonElement>('[aria-controls$="-invite"]')?.click();
      item.querySelector<HTMLInputElement>('.sl-invite-field')?.focus();
      announce(`${tableName(reply.table)} is ready. Share the link to invite friends.`);
      return;
    }
    announce(reply?.type === 'error' ? (ERROR_COPY[reply.code] ?? 'Could not create the table. Try again.') : 'Could not reach Scribble. Try again.');
  });

  const reply = await deps.request({ action: 'list_my_tables', accessToken });
  ui.body.removeAttribute('aria-busy');
  if (reply?.type === 'error' && (reply.code === 'invalid_access_token' || reply.code === 'sign_in_required')) {
    ui.setAccount(null);
    membersOnly(ui.body, 'Your sign-in has expired. Sign in again to see your tables.');
    return;
  }
  if (reply?.type !== 'my_tables') {
    const retry = h('button', { type: 'button', class: 'sl-btn sl-btn-gold' }, 'Try again');
    retry.addEventListener('click', () => void renderLobby(host, config, deps));
    ui.body.replaceChildren(
      hero(),
      h(
        'section',
        { class: 'sl-panel', role: 'alert' },
        h('h2', {}, 'Your tables did not load'),
        h('p', {}, reply?.type === 'error' ? (ERROR_COPY[reply.code] ?? 'Something went wrong.') : 'Scribble could not be reached.'),
        h('div', { class: 'sl-actions' }, retry),
      ),
    );
    return;
  }

  ui.setAccount(reply.you);
  for (const table of reply.tables) {
    list.append(renderCard(view, table));
  }
  ui.body.replaceChildren(
    hero(),
    form,
    h(
      'section',
      { class: 'sl-tables', 'aria-labelledby': 'sl-tables-heading' },
      h('h2', { class: 'sl-section-title', id: 'sl-tables-heading' }, 'Your tables ', count),
      status,
      list,
      empty,
    ),
  );
  view.refreshEmpty();
}

export interface NoticeAction {
  label: string;
  href: string;
  primary?: boolean;
}

/** A full-page message under the shared header: not found, members only, unavailable. */
export function renderNotice(
  host: HTMLElement,
  notice: { title: string; body: string; actions?: NoticeAction[]; account?: GameHeaderAccount | null; returnTo?: string },
): void {
  let account = notice.account;
  if (account === undefined) {
    try {
      account = parseAccountHint(window.localStorage.getItem(ACCOUNT_HINT_KEY));
    } catch {
      account = null;
    }
  }
  const ui = shell(host, account, notice.returnTo);
  const actions = (notice.actions ?? []).map((action) =>
    h('a', { class: `sl-btn ${action.primary ? 'sl-btn-gold' : 'sl-btn-ghost-light'}`, href: action.href }, action.label),
  );
  ui.body.replaceChildren(
    h(
      'section',
      { class: 'sl-panel sl-notice', 'aria-labelledby': 'sl-notice-heading' },
      letterTile(notice.title.charAt(0), 'sl-tile sl-panel-tile'),
      h('h1', { id: 'sl-notice-heading' }, notice.title),
      h('p', {}, notice.body),
      actions.length > 0 ? h('div', { class: 'sl-actions' }, ...actions) : null,
    ),
  );
}

export function renderMessage(host: HTMLElement, title: string, body: string, linkText = 'Back to your tables', href?: string): void {
  renderNotice(host, { title, body, actions: href ? [{ label: linkText, href, primary: true }] : [] });
}
