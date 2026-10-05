import { avatarUrl } from '@galaxyclass/accounts/avatars';
import { AWAY_REMOVE_AFTER_MS, EXCHANGE_MIN_BAG, MIN_PLAYERS } from '../rules/limits.js';
import type { PublicSeat, TableSnapshot } from '../runtime/types.js';
import { THEME_IDS, type ThemeId } from '../themes/ids.js';
import { THEMES } from '../themes/index.js';
import { describeError, type ControllerUi, type TableController } from './controller.js';
import { placedCount } from './draft.js';
import type { TableModel } from './model.js';
import { publicBase } from './route.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/** Away times and the Remove button age without new snapshots, so the bar redraws on its own. */
const CLOCK_MS = 30_000;

function awayFor(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function awayMs(seat: PublicSeat, now: number): number | null {
  if (!seat.occupied || seat.connected) {
    return null;
  }
  const since = seat.awaySince ? Date.parse(seat.awaySince) : Number.NaN;
  return Number.isFinite(since) ? Math.max(0, now - since) : AWAY_REMOVE_AFTER_MS;
}

function describeLastPlay(snapshot: TableSnapshot): string {
  const turn = snapshot.lastTurn;
  if (!turn || turn.kind !== 'play' || turn.words.length === 0) {
    return '';
  }
  const who = snapshot.seats.find((seat) => seat.seatId === turn.seatId);
  const name = who?.isLocal ? 'You' : (who?.displayName ?? 'A player');
  return `${name}: ${turn.words[0]!.text} +${turn.total}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') {
      node.className = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  node.append(...children);
  return node;
}

function button(label: string, action: string, extra: Record<string, string> = {}): HTMLButtonElement {
  return el('button', { type: 'button', 'data-action': action, ...extra }, label);
}

/**
 * Everything on the table screen that is not the canvas: who is seated and scoring, whose
 * turn it is, the turn buttons, the theme picker, and the blank-letter picker.
 */
export class TableOverlay implements ControllerUi {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  private readonly seats: HTMLElement;
  private readonly status: HTMLElement;
  private readonly bag: HTMLElement;
  private readonly theme: HTMLSelectElement;
  private readonly seatButton: HTMLButtonElement;
  private readonly controls: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly endPanel: HTMLElement;
  private readonly previewEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private pickerResolve: ((letter: string | null) => void) | null = null;
  private controller: TableController | null = null;

  constructor(
    host: HTMLElement,
    private readonly model: TableModel,
    tableName: string,
  ) {
    this.stage = el('div', { class: 'stage', 'aria-label': 'Game board' });
    this.seats = el('ol', { class: 'seats', 'aria-label': 'Players' });
    this.status = el('p', { class: 'turn-status', role: 'status', 'aria-live': 'polite' });
    this.bag = el('p', { class: 'bag-count' });
    this.theme = el('select', { class: 'theme-picker', 'aria-label': 'Table theme' });
    for (const id of THEME_IDS) {
      this.theme.append(el('option', { value: id }, THEMES[id].name));
    }
    this.seatButton = button('Leave seat', 'seat');
    const brand = el(
      'a',
      { class: 'brand', href: publicBase(), 'aria-label': 'Scribble tables' },
      el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'S'),
      el('span', { class: 'brand-text' }, el('strong', {}, 'Scribble'), el('small', {}, tableName)),
    );
    const topbar = el(
      'header',
      { class: 'topbar' },
      brand,
      this.seats,
      el('div', { class: 'table-meta' }, this.status, this.bag),
      el('div', { class: 'table-actions' }, this.theme, this.seatButton),
    );
    this.controls = el(
      'footer',
      { class: 'controls', 'aria-label': 'Turn controls' },
      button('Start game', 'start', { class: 'primary' }),
      button('Play', 'play', { class: 'primary' }),
      button('Recall', 'recall'),
      button('Shuffle', 'shuffle'),
      button('Exchange', 'exchange'),
      button('Pass', 'pass'),
      button('Swap selected', 'confirm-exchange', { class: 'primary' }),
      button('Cancel', 'cancel-exchange'),
      el(
        'div',
        { class: 'zoom', role: 'group', 'aria-label': 'Zoom' },
        button('−', 'zoom-out', { 'aria-label': 'Zoom out' }),
        button('Fit', 'zoom-fit', { 'aria-label': 'Fit board' }),
        button('+', 'zoom-in', { 'aria-label': 'Zoom in' }),
      ),
    );
    this.toastEl = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    this.previewEl = el('div', { class: 'preview', role: 'status', 'aria-live': 'polite', 'aria-label': 'Play preview', hidden: '' });
    this.picker = el(
      'div',
      { class: 'blank-picker', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'blank-picker-title', hidden: '' },
      el(
        'div',
        { class: 'blank-picker-card' },
        el('h2', { id: 'blank-picker-title' }, 'Choose a letter for the blank'),
        el('div', { class: 'letter-grid' }, ...LETTERS.map((letter) => button(letter, 'blank-letter', { 'data-letter': letter }))),
        button('Cancel', 'blank-cancel'),
      ),
    );
    this.endPanel = el('section', { class: 'end-panel', 'aria-live': 'polite', hidden: '' });
    this.root = el(
      'div',
      { class: 'table-screen' },
      this.stage,
      topbar,
      this.controls,
      this.previewEl,
      this.toastEl,
      this.picker,
      this.endPanel,
    );
    host.replaceChildren(this.root);

    this.root.addEventListener('click', (event) => this.onClick(event));
    this.theme.addEventListener('change', () => this.controller?.setTheme(this.theme.value as ThemeId));
    this.picker.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closePicker(null);
      } else if (/^[a-z]$/i.test(event.key)) {
        this.closePicker(event.key.toUpperCase());
      }
    });
    model.on((kind) => {
      if (kind === 'snapshot' || kind === 'draft' || kind === 'selection' || kind === 'theme') {
        this.render();
      } else if (kind === 'preview') {
        this.renderPreview();
      } else if (kind === 'layout') {
        this.placeFloaters();
      }
    });
    this.placeFloaters();
    this.render();
    setInterval(() => this.render(), CLOCK_MS);
  }

  /** The preview and toasts float just above the rack, whose height follows the tile size. */
  private placeFloaters(): void {
    this.root.style.setProperty('--rack-height', `${Math.round(this.model.layout.rack.height / this.model.unit)}px`);
  }

  bind(controller: TableController): void {
    this.controller = controller;
  }

  toast(text: string, tone: 'info' | 'error' = 'info'): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.classList.add('visible');
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), 3200);
  }

  pickBlank(): Promise<string | null> {
    this.closePicker(null);
    this.picker.hidden = false;
    (this.picker.querySelector('button') as HTMLButtonElement | null)?.focus();
    return new Promise((resolve) => {
      this.pickerResolve = resolve;
    });
  }

  private closePicker(letter: string | null): void {
    if (this.pickerResolve) {
      const resolve = this.pickerResolve;
      this.pickerResolve = null;
      this.picker.hidden = true;
      resolve(letter);
    }
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest('button');
    const action = target?.dataset.action;
    const controller = this.controller;
    if (!action || !controller) {
      return;
    }
    switch (action) {
      case 'start':
        controller.start();
        break;
      case 'play':
        void controller.play();
        break;
      case 'recall':
        controller.recall();
        break;
      case 'shuffle':
        controller.shuffle();
        break;
      case 'exchange':
        controller.beginExchange();
        break;
      case 'confirm-exchange':
        controller.confirmExchange();
        break;
      case 'cancel-exchange':
        controller.cancelExchange();
        break;
      case 'pass':
        controller.pass();
        break;
      case 'seat': {
        const snapshot = this.model.snapshot;
        if (!snapshot?.you) {
          controller.sit();
          break;
        }
        const inGame = snapshot.status === 'playing' && snapshot.seats.some((seat) => seat.isLocal && seat.inGame);
        // Closing the tab keeps the seat; this button gives it up, so check first mid-game.
        if (
          !inGame ||
          window.confirm('Leave this game for good? Your tiles go back in the bag. Closing the tab instead keeps your seat.')
        ) {
          controller.leave();
        }
        break;
      }
      case 'remove-player': {
        const seatId = target!.dataset.seat ?? '';
        const name = this.model.snapshot?.seats.find((seat) => seat.seatId === seatId)?.displayName ?? 'this player';
        if (window.confirm(`Remove ${name} from the table? Their tiles go back in the bag.`)) {
          controller.removePlayer(seatId);
        }
        break;
      }
      case 'zoom-in':
        controller.zoomBy(1.25);
        break;
      case 'zoom-out':
        controller.zoomBy(0.8);
        break;
      case 'zoom-fit':
        controller.resetZoom();
        break;
      case 'blank-letter':
        this.closePicker(target!.dataset.letter ?? null);
        break;
      case 'blank-cancel':
        this.closePicker(null);
        break;
      case 'new-game':
        controller.start();
        break;
    }
  }

  private render(): void {
    const model = this.model;
    const snapshot = model.snapshot;
    this.root.dataset.theme = model.theme.id;
    this.theme.value = model.theme.id;
    if (!snapshot) {
      this.status.textContent = 'Connecting…';
      return;
    }
    const seated = !!snapshot.you;
    const occupied = snapshot.seats.filter((seat) => seat.occupied);
    this.theme.disabled = !seated;
    this.theme.title = seated ? 'Change the theme for everyone at this table' : 'Sit down to change the theme';
    this.seatButton.textContent = seated ? 'Leave seat' : 'Sit down';
    this.seatButton.disabled = !seated && occupied.length >= snapshot.maxSeats;

    const now = Date.now();
    const canRemove = seated && snapshot.seats.some((seat) => seat.isLocal && seat.connected);
    this.seats.replaceChildren(
      ...snapshot.seats.map((seat) => {
        if (!seat.occupied) {
          return el('li', { class: 'seat empty', 'data-seat': seat.seatId }, el('span', { class: 'seat-name' }, 'Open seat'));
        }
        const classes = ['seat'];
        if (seat.seatId === snapshot.currentSeatId && snapshot.status === 'playing') {
          classes.push('active');
        }
        if (seat.isLocal) {
          classes.push('local');
        }
        const away = awayMs(seat, now);
        if (away !== null) {
          classes.push('away');
        }
        const avatar = el('img', {
          class: 'avatar',
          src: avatarUrl(seat.avatarId ?? 1),
          alt: '',
          width: '36',
          height: '36',
          loading: 'lazy',
        });
        const name = el('span', { class: 'seat-name' }, seat.displayName ?? 'Player');
        if (seat.isLocal) {
          name.append(el('span', { class: 'you' }, ' (you)'));
        }
        const meta = el(
          'span',
          { class: 'seat-meta' },
          el('span', { class: 'score', 'data-score': String(seat.score) }, String(model.displayScore(seat.seatId, seat.score))),
          seat.inGame ? el('span', { class: 'rack-count', title: 'Tiles on rack' }, `${seat.rackCount} tiles`) : '',
          away !== null
            ? el('span', { class: 'badge away', title: 'Their seat is held until they come back' }, `Away ${awayFor(away)}`)
            : seat.signedIn
              ? el('span', { class: 'badge', title: 'Signed in to Galaxy Class' }, 'Member')
              : el('span', { class: 'badge guest' }, 'Guest'),
        );
        const body = el('span', { class: 'seat-body' }, name, meta);
        const item = el('li', { class: classes.join(' '), 'data-seat': seat.seatId }, avatar, body);
        if (canRemove && away !== null && away >= AWAY_REMOVE_AFTER_MS) {
          item.append(
            button('Remove', 'remove-player', {
              class: 'seat-remove',
              'data-seat': seat.seatId,
              'aria-label': `Remove ${seat.displayName ?? 'player'} from the table`,
            }),
          );
        }
        return item;
      }),
    );

    const lastPlay = describeLastPlay(snapshot);
    const bagCount = snapshot.status === 'waiting' ? '' : `${snapshot.bagCount} in bag`;
    this.bag.textContent = [lastPlay, bagCount].filter(Boolean).join(' · ');
    const current = snapshot.seats.find((seat) => seat.seatId === snapshot.currentSeatId);
    if (snapshot.status === 'waiting') {
      this.status.textContent =
        occupied.length < MIN_PLAYERS ? `Waiting for players (${occupied.length}/${MIN_PLAYERS})` : 'Ready to start';
    } else if (snapshot.status === 'playing') {
      const awaySuffix = current && !current.connected ? ' (away)' : '';
      this.status.textContent = model.isMyTurn ? 'Your turn' : `${current?.displayName ?? 'Someone'}'s turn${awaySuffix}`;
    } else {
      this.status.textContent = 'Game over';
    }

    const exchanging = !!model.exchange;
    const playing = snapshot.status === 'playing' && seated;
    const show = (action: string, visible: boolean, enabled = true) => {
      const node = this.controls.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
      node.hidden = !visible;
      node.disabled = !enabled;
    };
    show('start', seated && snapshot.status === 'waiting', occupied.length >= MIN_PLAYERS);
    show('play', playing && !exchanging, model.isMyTurn && placedCount(model.draft) > 0);
    show('recall', playing && !exchanging, placedCount(model.draft) > 0);
    show('shuffle', playing && !exchanging);
    show('exchange', playing && !exchanging, model.isMyTurn && snapshot.bagCount >= EXCHANGE_MIN_BAG);
    show('pass', playing && !exchanging, model.isMyTurn);
    show('confirm-exchange', exchanging, (model.exchange?.size ?? 0) > 0);
    show('cancel-exchange', exchanging);
    const swap = this.controls.querySelector<HTMLButtonElement>('[data-action="confirm-exchange"]')!;
    swap.textContent = `Swap ${model.exchange?.size ?? 0}`;

    this.renderPreview();
    this.renderEnd();
  }

  private renderPreview(): void {
    const { preview, verdict } = this.model;
    if (this.model.exchange || preview.kind === 'none' || preview.kind === 'blank') {
      this.previewEl.hidden = true;
      return;
    }
    this.previewEl.hidden = false;
    if (verdict.state === 'placement') {
      this.previewEl.dataset.tone = 'error';
      this.previewEl.replaceChildren(
        el('span', {}, describeError({ type: 'error', code: 'invalid_placement', reason: verdict.reason })),
      );
      return;
    }
    if (preview.kind !== 'words') {
      return;
    }
    this.previewEl.dataset.tone = verdict.state === 'rejected' ? 'error' : verdict.state === 'valid' ? 'ok' : 'pending';
    const words = preview.words.map((word) => {
      const known = this.model.wordValidity.get(word.text);
      const mark = known === undefined ? '…' : known ? '✓' : '✗';
      return el(
        'span',
        { class: 'preview-word', 'data-valid': known === undefined ? 'unknown' : String(known) },
        word.text,
        ' ',
        el('b', {}, String(word.score)),
        el('span', { class: 'preview-mark' }, mark),
      );
    });
    const tail =
      verdict.state === 'rejected'
        ? el('span', { class: 'preview-note' }, `${verdict.words.join(', ')} ${verdict.words.length === 1 ? 'is' : 'are'} not in the word list`)
        : el(
            'span',
            { class: 'preview-total' },
            preview.bingo ? 'with +50 bingo ' : '',
            el('strong', {}, `${preview.total}`),
            ` point${preview.total === 1 ? '' : 's'}`,
          );
    this.previewEl.replaceChildren(...words, tail);
  }

  private renderEnd(): void {
    const snapshot = this.model.snapshot!;
    if (snapshot.status !== 'ended') {
      this.endPanel.hidden = true;
      return;
    }
    const reasons = {
      played_out: 'A player used their last tile.',
      scoreless_turns: 'Six scoreless turns in a row.',
      abandoned: 'Too few players stayed to finish.',
    } as const;
    const rows = snapshot.seats
      .filter((seat) => seat.occupied || snapshot.finalAdjustments?.[seat.seatId] !== undefined)
      .sort((a, b) => b.score - a.score)
      .map((seat) => {
        const adjustment = snapshot.finalAdjustments?.[seat.seatId] ?? 0;
        return el(
          'li',
          {},
          el('span', {}, seat.displayName ?? `Seat ${seat.seatId}`),
          el('span', { class: 'adjust' }, adjustment === 0 ? '' : adjustment > 0 ? `+${adjustment}` : String(adjustment)),
          el('strong', {}, String(seat.score)),
        );
      });
    this.endPanel.replaceChildren(
      el('h2', {}, 'Game over'),
      el('p', {}, snapshot.endReason ? reasons[snapshot.endReason] : ''),
      el('ol', { class: 'final-scores' }, ...rows),
      snapshot.you ? button('New game', 'new-game', { class: 'primary' }) : '',
    );
    this.endPanel.hidden = false;
  }
}
