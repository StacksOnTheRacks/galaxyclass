import { avatarUrl, isAvatarId } from '@galaxyclass/accounts/avatars';
import type { PublicSeat, TableSnapshot } from '../../protocol.js';
import { SUSPECT_COLOR, SUSPECT_NAME } from '../../rules/constants.js';
import { publicBase } from '../route.js';
import type { ViewModel } from '../view-model.js';
import { h, setText } from './dom.js';
import { suspectChip } from './figures.js';

export interface HudIntents {
  toggleMute(): void;
  claimAbandoned(): void;
  newGame(): void;
  leave(): void;
}

function seatSub(seat: PublicSeat, snapshot: TableSnapshot | null): string {
  if (!seat.occupied) {
    return 'Open seat';
  }
  if (!seat.connected) {
    return 'Away';
  }
  if (snapshot?.status === 'setup') {
    if (!seat.suspect) {
      return 'Choosing…';
    }
    return seat.ready ? 'Ready' : SUSPECT_NAME[seat.suspect];
  }
  if (seat.eliminated) {
    return 'Out of the running';
  }
  if (seat.suspect) {
    return seat.handSize !== null ? `${SUSPECT_NAME[seat.suspect]} · ${seat.handSize} cards` : SUSPECT_NAME[seat.suspect];
  }
  return seat.isLocal ? 'You' : 'Detective';
}

/** The top bar: back to tables, the detectives, sound, and the table menu. The turn line sits under it. */
export class Hud {
  readonly root: HTMLElement;
  readonly statusBar: HTMLElement;
  private readonly tableName: HTMLElement;
  private readonly seats: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly menu: HTMLDetailsElement;
  private readonly claimButton: HTMLButtonElement;
  private readonly newGameButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;

  constructor(intents: HudIntents) {
    this.tableName = h('small', { class: 'wd-brand-table' }, 'Table');
    const brand = h(
      'a',
      { class: 'wd-brand', href: publicBase(), 'aria-label': 'Back to your Whodunit? tables' },
      h('span', { class: 'wd-brand-mark', 'aria-hidden': 'true' }, '?'),
      h('span', { class: 'wd-brand-text' }, h('strong', {}, 'Whodunit?'), this.tableName),
    );
    this.seats = h('ol', { class: 'wd-seats', 'aria-label': 'Detectives' });
    this.muteButton = h('button', { type: 'button', class: 'wd-icon-btn wd-mute', 'aria-pressed': 'false' });
    this.muteButton.addEventListener('click', () => intents.toggleMute());

    this.claimButton = h('button', { type: 'button', class: 'wd-menu-item', 'data-testid': 'claim-abandoned' }, 'Clear away detectives');
    this.claimButton.addEventListener('click', () => {
      this.menu.open = false;
      intents.claimAbandoned();
    });
    this.newGameButton = h('button', { type: 'button', class: 'wd-menu-item' }, 'Open a new case');
    this.newGameButton.addEventListener('click', () => {
      this.menu.open = false;
      intents.newGame();
    });
    this.leaveButton = h('button', { type: 'button', class: 'wd-menu-item wd-danger', 'data-testid': 'leave-table' }, 'Leave table');
    this.leaveButton.addEventListener('click', () => {
      this.menu.open = false;
      intents.leave();
    });
    this.menu = h(
      'details',
      { class: 'wd-menu' },
      h('summary', { class: 'wd-icon-btn', 'aria-label': 'Table menu' }, h('span', { class: 'wd-menu-dots', 'aria-hidden': 'true' })),
      h(
        'div',
        { class: 'wd-menu-list' },
        this.newGameButton,
        this.claimButton,
        this.leaveButton,
        h('a', { class: 'wd-menu-item', href: publicBase() }, 'Back to your tables'),
      ),
    );
    this.root = h(
      'header',
      { class: 'wd-topbar' },
      brand,
      this.seats,
      h('div', { class: 'wd-topbar-actions' }, this.muteButton, this.menu),
    );
    this.statusText = h('span', { class: 'wd-status-text', 'data-testid': 'status' });
    this.statusBar = h('div', { class: 'wd-status', 'data-tone': 'neutral' }, h('span', { class: 'wd-status-dot', 'aria-hidden': 'true' }), this.statusText);
  }

  setTableName(name: string): void {
    setText(this.tableName, name);
  }

  setMuted(muted: boolean, available: boolean): void {
    this.muteButton.hidden = !available;
    this.muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
    this.muteButton.setAttribute('aria-label', muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off');
    this.muteButton.dataset.muted = muted ? 'true' : 'false';
  }

  update(vm: ViewModel, snapshot: TableSnapshot | null): void {
    setText(this.statusText, vm.status);
    this.statusBar.dataset.tone = vm.tone;
    this.claimButton.hidden = !vm.canClaimAbandoned;
    this.newGameButton.hidden = !vm.canNewGame;
    this.leaveButton.hidden = !vm.me;

    const seats = (snapshot?.seats ?? []).filter((seat) => seat.occupied);
    const current = snapshot?.status === 'playing' ? snapshot.currentSeatId : null;
    const items = seats.map((seat) => {
      const avatar = seat.suspect
        ? suspectChip(seat.suspect, 'wd-seat-avatar wd-seat-portrait')
        : isAvatarId(seat.avatarId)
          ? h('img', { class: 'wd-seat-avatar', src: avatarUrl(seat.avatarId), alt: '', width: '36', height: '36' })
          : h('span', { class: 'wd-seat-avatar', 'aria-hidden': 'true' }, (seat.displayName ?? '?').charAt(0).toUpperCase());
      const name = seat.isLocal ? `${seat.displayName ?? 'You'} (you)` : (seat.displayName ?? 'Detective');
      const sub = seatSub(seat, snapshot);
      const host = snapshot?.hostSeatId === seat.seatId;
      return h(
        'li',
        {
          class: 'wd-seat',
          'data-seat': seat.seatId,
          'data-local': seat.isLocal ? 'true' : undefined,
          'data-turn': current === seat.seatId ? 'true' : undefined,
          'data-away': !seat.connected ? 'true' : undefined,
          'data-ready': snapshot?.status === 'setup' && seat.ready ? 'true' : undefined,
          'data-out': seat.eliminated ? 'true' : undefined,
          style: seat.suspect ? `--wd-accent:${SUSPECT_COLOR[seat.suspect]}` : undefined,
          'aria-label': `${name}${host ? ', host' : ''}, ${sub}${current === seat.seatId ? ', taking their turn' : ''}`,
        },
        avatar,
        h('span', { class: 'wd-seat-text', 'aria-hidden': 'true' }, h('strong', {}, name, host ? h('span', { class: 'wd-host-mark', title: 'Host' }, ' ★') : null), h('small', {}, sub)),
      );
    });
    const signature = seats.map((seat) => `${seat.seatId}:${seat.suspect}:${seat.connected}:${seat.ready}:${seat.eliminated}:${seat.handSize}:${seat.displayName}:${current === seat.seatId}:${snapshot?.hostSeatId}:${snapshot?.status}`).join('|');
    if (this.seats.dataset.signature !== signature) {
      this.seats.dataset.signature = signature;
      this.seats.replaceChildren(...items);
    }
  }
}
