import { ACCOUNT_HINT_KEY, parseAccountHint } from '@galaxyclass/accounts/account-hint';
import { avatarUrl, isAvatarId } from '@galaxyclass/accounts/avatars';
import {
  galaxyClassSignInUrl,
  galaxyClassSignUpUrl,
  renderGameHeader,
  type GameHeaderAccount,
} from '@galaxyclass/accounts/game-header';
import type { TableSummary } from '../protocol.js';
import { MAX_OWNED_TABLES } from '../rules/constants.js';
import type { WarshipsConfig } from './config.js';
import { accessTokenSource, type GetAccessToken } from './player-token.js';
import { publicBase, tablePath } from './route.js';
import { memberRequest, type MemberReply } from './session.js';
import { h } from './views/dom.js';

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

export function lobbyDeps(config: WarshipsConfig): LobbyDeps {
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

/** The sonar-ring emblem used for monograms and panel badges. */
function emblem(letter: string | null, className = 'wl-emblem'): HTMLElement {
  return h(
    'span',
    { class: className, 'aria-hidden': 'true' },
    h('span', { class: 'wl-emblem-sweep' }),
    letter ? h('span', { class: 'wl-emblem-letter' }, letter.toUpperCase()) : null,
  );
}

const STATUS_LABEL: Record<TableSummary['status'], string> = {
  waiting: 'Waiting for a captain',
  placing: 'Deploying fleets',
  battle: 'Battle under way',
  finished: 'Battle over',
};

function tableName(table: TableSummary): string {
  return table.tableName ?? 'Untitled table';
}

const inGame = (table: TableSummary) => table.status === 'placing' || table.status === 'battle';

/** What the card's main button does for this member right now. */
export function primaryAction(table: TableSummary): { label: string; hint: string | null } {
  const seated = table.seats.some((seat) => seat.isYou);
  if (seated) {
    return { label: inGame(table) ? 'Return to battle' : 'Enter table', hint: null };
  }
  if (inGame(table)) {
    return { label: 'Game in progress', hint: 'Seats are locked until this battle ends.' };
  }
  if (table.seats.length >= table.maxSeats) {
    return { label: 'Table full', hint: 'Both seats are taken.' };
  }
  return { label: 'Take a seat', hint: null };
}

function seatSummary(table: TableSummary): string {
  const parts = [`${table.seats.length} of ${table.maxSeats} captains`];
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

function renderSeats(table: TableSummary): HTMLElement {
  const list = h('ul', { class: 'wl-seats', 'aria-label': 'Captains' });
  for (let i = 0; i < table.maxSeats; i++) {
    const seat = table.seats[i];
    if (i === 1) {
      list.append(h('li', { class: 'wl-versus', 'aria-hidden': 'true' }, 'vs'));
    }
    if (!seat) {
      const locked = inGame(table);
      list.append(
        h(
          'li',
          { class: 'wl-seat wl-seat-open', 'data-locked': locked ? 'true' : undefined },
          h('span', { class: 'wl-seat-avatar' }, seatIcon(locked ? 'locked' : 'open')),
          h('span', { class: 'wl-seat-name' }, locked ? 'Locked' : 'Open seat'),
        ),
      );
      continue;
    }
    const avatar = isAvatarId(seat.avatarId)
      ? h('img', { class: 'wl-seat-avatar', src: avatarUrl(seat.avatarId), alt: '', width: '44', height: '44', loading: 'lazy' })
      : h('span', { class: 'wl-seat-avatar', 'aria-hidden': 'true' }, seat.displayName.charAt(0).toUpperCase());
    const label = [seat.displayName, seat.isYou ? '(you)' : null, seat.away ? '(away)' : null].filter(Boolean).join(' ');
    list.append(
      h(
        'li',
        {
          class: 'wl-seat',
          'data-you': seat.isYou ? 'true' : undefined,
          'data-away': seat.away ? 'true' : undefined,
          'aria-label': label,
        },
        avatar,
        h('span', { class: 'wl-seat-name', 'aria-hidden': 'true' }, seat.isYou ? 'You' : seat.displayName),
      ),
    );
  }
  return list;
}

interface LobbyView {
  deps: LobbyDeps;
  accessToken: string;
  announce(text: string): void;
  list: HTMLUListElement;
  refreshEmpty(): void;
}

function inviteText(table: TableSummary): string {
  return `Join my Warships table “${tableName(table)}” on Galaxy Class.`;
}

function renderCard(view: LobbyView, table: TableSummary): HTMLLIElement {
  const { deps } = view;
  const name = tableName(table);
  const base = `wl-card-${table.tableId}`;
  const link = `${deps.origin}${tablePath(table.tableId)}`;
  const action = primaryAction(table);
  const monogram = /[A-Za-z]/.exec(name)?.[0] ?? null;

  const linkField = h('input', {
    class: 'wl-invite-field',
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
    { class: 'wl-invite', id: `${base}-invite`, hidden: true },
    h('label', { class: 'wl-invite-label', for: `${base}-link` }, 'Invite link'),
    h('p', { class: 'wl-invite-note' }, 'Your opponent signs in with Galaxy Class and opens the link. Placing starts once they sit.'),
    linkField,
  );
  const inviteActions = h('div', { class: 'wl-invite-actions' });
  const copyInPanel = h('button', { type: 'button', class: 'wl-btn wl-btn-small' }, 'Copy');
  copyInPanel.addEventListener('click', () => void copyLink());
  const email = h(
    'a',
    {
      class: 'wl-btn wl-btn-small',
      href: `mailto:?subject=${encodeURIComponent(`Warships: ${name}`)}&body=${encodeURIComponent(`${inviteText(table)}\n\n${link}`)}`,
    },
    'Email',
  );
  inviteActions.append(copyInPanel, email);
  if (deps.share) {
    const share = h('button', { type: 'button', class: 'wl-btn wl-btn-small' }, 'Share…');
    share.addEventListener('click', () => {
      void deps.share!({ title: `Warships: ${name}`, text: inviteText(table), url: link }).catch(() => {});
    });
    inviteActions.append(share);
  }
  invitePanel.append(inviteActions);

  const inviteToggle = h(
    'button',
    { type: 'button', class: 'wl-btn wl-btn-ghost', 'aria-expanded': 'false', 'aria-controls': `${base}-invite` },
    'Invite',
  );
  const openInvite = (open: boolean) => {
    invitePanel.hidden = !open;
    inviteToggle.setAttribute('aria-expanded', String(open));
  };
  inviteToggle.addEventListener('click', () => openInvite(invitePanel.hidden));

  const copyButton = h('button', { type: 'button', class: 'wl-btn wl-btn-ghost' }, 'Copy link');
  copyButton.addEventListener('click', () => void copyLink());

  const hosting = table.role === 'owner';
  const remove = h(
    'button',
    { type: 'button', class: hosting ? 'wl-text-btn wl-text-btn-danger' : 'wl-text-btn' },
    hosting ? 'Delete table' : 'Remove from my tables',
  );
  const item = h('li', { class: 'wl-card-item', id: base });
  const dropCard = (announcement: string) => {
    const next = (item.nextElementSibling ?? item.previousElementSibling)?.querySelector<HTMLElement>('.wl-btn-primary');
    item.remove();
    view.refreshEmpty();
    view.announce(announcement);
    next?.focus();
  };
  remove.addEventListener('click', async () => {
    if (hosting) {
      const during = inGame(table) ? ' The battle in progress ends now.' : '';
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
    { class: 'wl-card', 'data-status': table.status, 'aria-labelledby': `${base}-name` },
    h(
      'div',
      { class: 'wl-card-top' },
      emblem(monogram, 'wl-emblem wl-card-monogram'),
      h(
        'div',
        { class: 'wl-card-heading' },
        h('h3', { class: 'wl-card-name', id: `${base}-name` }, name),
        h('p', { class: 'wl-card-meta' }, seatSummary(table)),
      ),
      h('span', { class: 'wl-badge', 'data-status': table.status }, STATUS_LABEL[table.status]),
    ),
    renderSeats(table),
    action.hint ? h('p', { class: 'wl-card-hint' }, action.hint) : null,
    h(
      'div',
      { class: 'wl-actions' },
      h('a', { class: 'wl-btn wl-btn-primary', href: tablePath(table.tableId) }, action.label),
      copyButton,
      inviteToggle,
    ),
    invitePanel,
    h('div', { class: 'wl-card-footer' }, remove),
  );
  item.append(card);
  return item;
}

function hero(): HTMLElement {
  return h(
    'header',
    { class: 'wl-hero' },
    emblem(null, 'wl-emblem wl-hero-emblem'),
    h('h1', { class: 'wl-title' }, 'Warships'),
    h(
      'p',
      { class: 'wl-lede' },
      'Your naval tables. Start one, send the link to a rival captain, and the battle begins once both of you are seated.',
    ),
  );
}

function shell(
  host: HTMLElement,
  account: GameHeaderAccount | null,
  returnTo = publicBase(),
): { page: HTMLElement; body: HTMLElement; setAccount(a: GameHeaderAccount | null): void } {
  const page = h('div', { class: 'wl-page' });
  const inner = h('div', { class: 'wl-inner' });
  const header = (a: GameHeaderAccount | null) => renderGameHeader({ account: a, guests: false, returnTo });
  let current = header(account);
  const body = h('main', { class: 'wl-main', id: 'main' });
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
      { class: 'wl-panel wl-members', 'aria-labelledby': 'wl-members-heading' },
      emblem('M', 'wl-emblem wl-panel-emblem'),
      h('h2', { id: 'wl-members-heading' }, 'Warships is for Galaxy Class members'),
      h(
        'p',
        {},
        note ??
          'Sign in to see your tables, start a new one, and challenge a friend. Invite links work for anyone with a free Galaxy Class account.',
      ),
      h(
        'div',
        { class: 'wl-actions' },
        h('a', { class: 'wl-btn wl-btn-primary', href: galaxyClassSignInUrl(returnTo) }, 'Sign in'),
        h('a', { class: 'wl-btn wl-btn-ghost', href: galaxyClassSignUpUrl(returnTo) }, 'Create an account'),
      ),
    ),
  );
}

function skeletons(count: number): HTMLLIElement[] {
  return Array.from({ length: count }, () =>
    h('li', { class: 'wl-card-item', 'aria-hidden': 'true' }, h('div', { class: 'wl-card wl-card-skeleton' })),
  );
}

const ERROR_COPY: Record<string, string> = {
  table_limit: `You already host ${MAX_OWNED_TABLES} tables. Delete one to start another.`,
  identity_unavailable: 'Sign-in checks are unavailable right now. Try again shortly.',
};

/** `/warships`: a member's own tables, never a public lobby. */
export async function renderLobby(host: HTMLElement, config: WarshipsConfig, deps: LobbyDeps = lobbyDeps(config)): Promise<void> {
  document.title = 'Your tables · Warships';
  const hint = deps.readHint();
  const ui = shell(host, hint);
  ui.body.setAttribute('aria-busy', 'true');
  ui.body.replaceChildren(hero(), h('ul', { class: 'wl-grid' }, ...skeletons(2)));

  const accessToken = await deps.getAccessToken();
  if (!accessToken) {
    ui.setAccount(null);
    ui.body.removeAttribute('aria-busy');
    membersOnly(ui.body);
    return;
  }

  const status = h('p', { class: 'wl-live', role: 'status', 'aria-live': 'polite' });
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = (text: string) => {
    status.textContent = text;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      status.textContent = '';
    }, 6000);
  };

  const list = h('ul', { class: 'wl-grid', 'aria-labelledby': 'wl-tables-heading' });
  const count = h('span', { class: 'wl-count' });
  const empty = h(
    'div',
    { class: 'wl-panel wl-empty', hidden: true },
    emblem(null, 'wl-emblem wl-panel-emblem'),
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
    id: 'wl-new-name',
    name: 'tableName',
    type: 'text',
    maxlength: '40',
    autocomplete: 'off',
    placeholder: 'Friday night fleet action',
    'aria-describedby': 'wl-new-help',
  });
  const createButton = h('button', { type: 'submit', class: 'wl-btn wl-btn-primary' }, 'Create table');
  const form = h(
    'form',
    { class: 'wl-panel wl-create', 'aria-labelledby': 'wl-new-heading' },
    h('h2', { id: 'wl-new-heading' }, 'Start a new table'),
    h(
      'div',
      { class: 'wl-create-row' },
      h('label', { class: 'wl-create-label', for: 'wl-new-name' }, 'Table name'),
      nameInput,
      createButton,
    ),
    h('p', { class: 'wl-create-help', id: 'wl-new-help' }, 'Two captains per table. Share the link; placing starts when your opponent sits.'),
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
      item.querySelector<HTMLInputElement>('.wl-invite-field')?.focus();
      announce(`${tableName(reply.table)} is ready. Share the link to challenge a friend.`);
      return;
    }
    announce(reply?.type === 'error' ? (ERROR_COPY[reply.code] ?? 'Could not create the table. Try again.') : 'Could not reach Warships. Try again.');
  });

  const reply = await deps.request({ action: 'list_my_tables', accessToken });
  ui.body.removeAttribute('aria-busy');
  if (reply?.type === 'error' && (reply.code === 'invalid_access_token' || reply.code === 'sign_in_required')) {
    ui.setAccount(null);
    membersOnly(ui.body, 'Your sign-in has expired. Sign in again to see your tables.');
    return;
  }
  if (reply?.type !== 'my_tables') {
    const retry = h('button', { type: 'button', class: 'wl-btn wl-btn-primary' }, 'Try again');
    retry.addEventListener('click', () => void renderLobby(host, config, deps));
    ui.body.replaceChildren(
      hero(),
      h(
        'section',
        { class: 'wl-panel', role: 'alert' },
        h('h2', {}, 'Your tables did not load'),
        h('p', {}, reply?.type === 'error' ? (ERROR_COPY[reply.code] ?? 'Something went wrong.') : 'Warships could not be reached.'),
        h('div', { class: 'wl-actions' }, retry),
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
      { class: 'wl-tables', 'aria-labelledby': 'wl-tables-heading' },
      h('h2', { class: 'wl-section-title', id: 'wl-tables-heading' }, 'Your tables ', count),
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
    h('a', { class: `wl-btn ${action.primary ? 'wl-btn-primary' : 'wl-btn-ghost'}`, href: action.href }, action.label),
  );
  ui.body.replaceChildren(
    h(
      'section',
      { class: 'wl-panel wl-notice', 'aria-labelledby': 'wl-notice-heading' },
      emblem(notice.title.charAt(0), 'wl-emblem wl-panel-emblem'),
      h('h1', { id: 'wl-notice-heading' }, notice.title),
      h('p', {}, notice.body),
      actions.length > 0 ? h('div', { class: 'wl-actions' }, ...actions) : null,
    ),
  );
}
