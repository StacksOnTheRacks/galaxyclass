import type { GameRecap, PublicSeat } from '../../protocol.js';
import { h, setText } from './dom.js';
import { renderRecap } from './recap-view.js';

export interface EndIntents {
  rematch(): void;
}

export interface EndState {
  won: boolean;
  line: string;
  canRematch: boolean;
  rematchVoted: boolean;
  opponentRematchVoted: boolean;
  opponentName: string | null;
  recap: GameRecap | undefined;
  seats: PublicSeat[];
}

/**
 * Everything layered over the boards: toasts, the polite live region that narrates every shot,
 * the banner layer, and the victory/defeat screen with Rematch and the after-action report.
 */
export class Overlay {
  readonly bannerLayer: HTMLElement;
  readonly toastEl: HTMLElement;
  readonly live: HTMLElement;
  readonly end: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly endLine: HTMLElement;
  private readonly rematchButton: HTMLButtonElement;
  private readonly rematchNote: HTMLElement;
  private readonly reportButton: HTMLButtonElement;
  private readonly reportSlot: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private endKey = '';

  constructor(intents: EndIntents) {
    this.bannerLayer = h('div', { class: 'ws-banners', 'aria-hidden': 'true' });
    this.toastEl = h('div', { class: 'ws-toast', role: 'status', 'aria-live': 'polite', hidden: true });
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });

    this.endTitle = h('h2', { class: 'ws-end-title', id: 'ws-end-title' });
    this.endLine = h('p', { class: 'ws-end-line' });
    this.rematchButton = h('button', { type: 'button', class: 'ws-btn ws-btn-primary' }, 'Rematch');
    this.rematchButton.addEventListener('click', () => intents.rematch());
    this.rematchNote = h('p', { class: 'ws-end-note', role: 'status' });
    this.reportButton = h('button', { type: 'button', class: 'ws-btn', 'aria-expanded': 'false' }, 'After-action report');
    this.reportSlot = h('div', { class: 'ws-end-report', hidden: true });
    this.reportButton.addEventListener('click', () => {
      const open = this.reportSlot.hidden;
      this.reportSlot.hidden = !open;
      this.reportButton.setAttribute('aria-expanded', String(open));
    });
    const viewBoards = h('button', { type: 'button', class: 'ws-btn ws-btn-quiet' }, 'View boards');
    viewBoards.addEventListener('click', () => this.minimizeEnd(true));
    const restore = h('button', { type: 'button', class: 'ws-btn ws-end-restore' }, 'Battle report');
    restore.addEventListener('click', () => this.minimizeEnd(false));
    this.end = h(
      'section',
      { class: 'ws-end', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'ws-end-title', hidden: true },
      h(
        'div',
        { class: 'ws-end-card' },
        h('span', { class: 'ws-end-emblem', 'aria-hidden': 'true' }),
        this.endTitle,
        this.endLine,
        h('div', { class: 'ws-end-actions' }, this.rematchButton, this.reportButton, viewBoards),
        this.rematchNote,
        this.reportSlot,
      ),
      restore,
    );
  }

  toast(text: string, tone: 'info' | 'error' = 'info'): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.hidden = false;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastEl.hidden = true;
    }, 4200);
  }

  /** Narrates for screen readers: "Admiral fires at C7. Hit. Your Cruiser was sunk." */
  announce(text: string): void {
    // Clearing first makes a repeated message ("Miss.") read again.
    this.live.textContent = '';
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
    }
    this.liveTimer = setTimeout(() => {
      this.live.textContent = text;
    }, 30);
  }

  showEnd(state: EndState): void {
    const key = `${state.won}:${state.line}`;
    if (this.endKey !== key) {
      this.endKey = key;
      this.end.dataset.minimized = 'false';
      this.reportSlot.hidden = true;
      this.reportButton.setAttribute('aria-expanded', 'false');
    }
    this.end.hidden = false;
    this.end.dataset.result = state.won ? 'win' : 'lose';
    setText(this.endTitle, state.won ? 'Victory' : 'Defeat');
    setText(this.endLine, state.line);
    this.rematchButton.disabled = !state.canRematch;
    this.rematchButton.textContent = state.rematchVoted ? 'Rematch requested' : 'Rematch';
    const them = state.opponentName ?? 'Your opponent';
    let note = '';
    if (!state.opponentName) {
      note = 'Your opponent has left the table. Share the link to find a new one.';
    } else if (state.rematchVoted && !state.opponentRematchVoted) {
      note = `Waiting for ${them} to accept…`;
    } else if (!state.rematchVoted && state.opponentRematchVoted) {
      note = `${them} wants a rematch.`;
    }
    setText(this.rematchNote, note);
    this.reportButton.hidden = !state.recap;
    if (state.recap) {
      const signature = `${state.recap.shots.length}:${state.recap.endedAt}`;
      if (this.reportSlot.dataset.signature !== signature) {
        this.reportSlot.dataset.signature = signature;
        this.reportSlot.replaceChildren(renderRecap(state.recap, state.seats));
      }
    }
  }

  hideEnd(): void {
    this.end.hidden = true;
    this.endKey = '';
  }

  minimizeEnd(minimized: boolean): void {
    this.end.dataset.minimized = minimized ? 'true' : 'false';
  }
}
