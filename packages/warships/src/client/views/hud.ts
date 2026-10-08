import { avatarUrl, isAvatarId } from '@galaxyclass/accounts/avatars';
import type { PublicSeat, TableSnapshot } from '../../protocol.js';
import { publicBase } from '../route.js';
import type { TrackerChip, ViewModel } from '../view-model.js';
import { h, setText } from './dom.js';

export interface HudIntents {
  toggleMute(): void;
  forfeit(): void;
  claimAbandoned(): void;
  leave(): void;
}

function seatSub(seat: PublicSeat, snapshot: TableSnapshot | null): string {
  if (!seat.occupied) {
    return 'Open seat';
  }
  if (!seat.connected) {
    return 'Away';
  }
  if (snapshot?.status === 'placing') {
    return seat.ready ? 'Ready' : 'Deploying…';
  }
  if (seat.shipsAfloat !== null) {
    return `${seat.shipsAfloat} ${seat.shipsAfloat === 1 ? 'ship' : 'ships'} afloat`;
  }
  return seat.isLocal ? 'You' : 'Captain';
}

/** The top bar: back to tables, the two captains, the turn line, sound, and the table menu. */
export class Hud {
  readonly root: HTMLElement;
  readonly statusBar: HTMLElement;
  private readonly tableName: HTMLElement;
  private readonly seats: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly menu: HTMLDetailsElement;
  private readonly forfeitButton: HTMLButtonElement;
  private readonly claimButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;

  constructor(intents: HudIntents) {
    this.tableName = h('small', { class: 'ws-brand-table' }, 'Table');
    const brand = h(
      'a',
      { class: 'ws-brand', href: publicBase(), 'aria-label': 'Back to your Warships tables' },
      h('span', { class: 'ws-brand-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'ws-brand-text' }, h('strong', {}, 'Warships'), this.tableName),
    );
    this.seats = h('ol', { class: 'ws-seats', 'aria-label': 'Captains' });
    this.muteButton = h('button', { type: 'button', class: 'ws-icon-btn ws-mute', 'aria-pressed': 'false' });
    this.muteButton.addEventListener('click', () => intents.toggleMute());

    this.forfeitButton = h('button', { type: 'button', class: 'ws-menu-item ws-danger' }, 'Concede battle');
    this.forfeitButton.addEventListener('click', () => {
      this.menu.open = false;
      intents.forfeit();
    });
    this.claimButton = h('button', { type: 'button', class: 'ws-menu-item' }, 'Claim the win (opponent gone)');
    this.claimButton.addEventListener('click', () => {
      this.menu.open = false;
      intents.claimAbandoned();
    });
    this.leaveButton = h('button', { type: 'button', class: 'ws-menu-item' }, 'Leave table');
    this.leaveButton.addEventListener('click', () => {
      this.menu.open = false;
      intents.leave();
    });
    this.menu = h(
      'details',
      { class: 'ws-menu' },
      h('summary', { class: 'ws-icon-btn', 'aria-label': 'Table menu' }, h('span', { class: 'ws-menu-dots', 'aria-hidden': 'true' })),
      h(
        'div',
        { class: 'ws-menu-list' },
        this.claimButton,
        this.forfeitButton,
        this.leaveButton,
        h('a', { class: 'ws-menu-item', href: publicBase() }, 'Back to your tables'),
      ),
    );
    this.root = h(
      'header',
      { class: 'ws-topbar' },
      brand,
      this.seats,
      h('div', { class: 'ws-topbar-actions' }, this.muteButton, this.menu),
    );
    this.statusText = h('span', { class: 'ws-status-text' });
    this.statusBar = h('div', { class: 'ws-status', 'data-tone': 'neutral' }, h('span', { class: 'ws-status-dot', 'aria-hidden': 'true' }), this.statusText);
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
    this.forfeitButton.hidden = !vm.canForfeit;
    this.claimButton.hidden = !vm.canClaimAbandoned;
    this.leaveButton.hidden = !vm.me;

    const seats = snapshot?.seats ?? [];
    const current = snapshot?.status === 'battle' ? snapshot.currentSeatId : null;
    const items = seats.map((seat) => {
      const avatar =
        seat.occupied && isAvatarId(seat.avatarId)
          ? h('img', { class: 'ws-seat-avatar', src: avatarUrl(seat.avatarId), alt: '', width: '36', height: '36' })
          : h('span', { class: 'ws-seat-avatar', 'aria-hidden': 'true' }, seat.occupied ? (seat.displayName ?? '?').charAt(0).toUpperCase() : '+');
      const name = seat.occupied ? (seat.isLocal ? `${seat.displayName ?? 'You'} (you)` : (seat.displayName ?? 'Captain')) : 'Open seat';
      const sub = seatSub(seat, snapshot);
      return h(
        'li',
        {
          class: 'ws-seat',
          'data-local': seat.isLocal ? 'true' : undefined,
          'data-turn': current === seat.seatId ? 'true' : undefined,
          'data-away': seat.occupied && !seat.connected ? 'true' : undefined,
          'data-ready': snapshot?.status === 'placing' && seat.ready ? 'true' : undefined,
          'aria-label': `${name}, ${sub}${current === seat.seatId ? ', firing' : ''}`,
        },
        avatar,
        h('span', { class: 'ws-seat-text', 'aria-hidden': 'true' }, h('strong', {}, name), h('small', {}, sub)),
      );
    });
    const signature = items.map((item) => item.outerHTML).join('');
    if (this.seats.dataset.signature !== signature) {
      this.seats.dataset.signature = signature;
      this.seats.replaceChildren(...items);
    }
  }
}

/** Five chips per fleet; a chip strikes through when that ship goes down. */
export class Tracker {
  readonly root: HTMLElement;
  private readonly chips = new Map<string, HTMLElement>();

  constructor(label: string) {
    this.root = h('ul', { class: 'ws-tracker', 'aria-label': label });
  }

  update(chips: TrackerChip[]): void {
    for (const chip of chips) {
      let node = this.chips.get(chip.shipId);
      if (!node) {
        node = h(
          'li',
          { class: 'ws-chip', 'data-ship': chip.shipId },
          h('span', { class: 'ws-chip-pips', 'aria-hidden': 'true', style: `--ws-len:${chip.length}` }),
          h('span', { class: 'ws-chip-name' }, chip.name),
        );
        this.chips.set(chip.shipId, node);
        this.root.append(node);
      }
      const sunk = chip.sunk ? 'true' : 'false';
      if (node.dataset.sunk !== sunk) {
        if (node.dataset.sunk === 'false' && chip.sunk) {
          node.dataset.fresh = 'true';
          setTimeout(() => delete node!.dataset.fresh, 1200);
        }
        node.dataset.sunk = sunk;
        node.setAttribute('aria-label', `${chip.name}, ${chip.sunk ? 'sunk' : 'afloat'}`);
      }
    }
  }
}
