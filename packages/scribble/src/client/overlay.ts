import { avatarUrl } from '@galaxyclass/accounts/avatars';
import { EXCHANGE_MIN_BAG, MIN_PLAYERS } from '../rules/limits.js';
import { THEME_IDS, type ThemeId } from '../themes/ids.js';
import { THEMES } from '../themes/index.js';
import type { ControllerUi, TableController } from './controller.js';
import { placedCount } from './draft.js';
import type { TableModel } from './model.js';
import { publicBase } from './route.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

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
    this.root = el('div', { class: 'table-screen' }, this.stage, topbar, this.controls, this.toastEl, this.picker, this.endPanel);
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
      }
    });
    this.render();
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
      case 'seat':
        if (this.model.snapshot?.you) {
          controller.leave();
        } else {
          controller.sit();
        }
        break;
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
          seat.signedIn ? el('span', { class: 'badge', title: 'Signed in to Galaxy Class' }, 'Member') : el('span', { class: 'badge guest' }, 'Guest'),
        );
        return el('li', { class: classes.join(' '), 'data-seat': seat.seatId }, avatar, el('span', { class: 'seat-body' }, name, meta));
      }),
    );

    this.bag.textContent = snapshot.status === 'waiting' ? '' : `${snapshot.bagCount} in bag`;
    const current = snapshot.seats.find((seat) => seat.seatId === snapshot.currentSeatId);
    if (snapshot.status === 'waiting') {
      this.status.textContent =
        occupied.length < MIN_PLAYERS ? `Waiting for players (${occupied.length}/${MIN_PLAYERS})` : 'Ready to start';
    } else if (snapshot.status === 'playing') {
      this.status.textContent = model.isMyTurn ? 'Your turn' : `${current?.displayName ?? 'Someone'}'s turn`;
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

    this.renderEnd();
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
