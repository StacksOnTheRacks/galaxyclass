import type { GameRecap, PublicSeat, Solution } from '../../protocol.js';
import type { EndReason, SeatId } from '../../rules/types.js';
import { solutionLine } from '../cards.js';
import { h, setText } from './dom.js';
import { cardFace } from './figures.js';
import { renderRecap } from './recap-view.js';

export interface EndIntents {
  newGame(): void;
}

export interface EndState {
  won: boolean;
  reason: EndReason | null;
  line: string;
  solution: Solution | null;
  canNewGame: boolean;
  hostName: string | null;
  recap: GameRecap | undefined;
  seats: PublicSeat[];
  me: SeatId | null;
}

/** The magnifying glass from the favicon, inside the brass ring. Static markup. */
const EMBLEM_SVG =
  '<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">' +
  '<circle cx="27" cy="27" r="17" fill="#2a1745"/><circle cx="27" cy="23" r="6" fill="#d9a441"/>' +
  '<path d="M23.5 26h7l2.5 13h-12z" fill="#d9a441"/>' +
  '<circle cx="27" cy="27" r="17" fill="none" stroke="#ff4fa3" stroke-width="4.5"/>' +
  '<path d="M40 40l14 14" stroke="#f5c96b" stroke-width="6" stroke-linecap="round"/></svg>';

function emblem(): HTMLElement {
  const node = h('span', { class: 'wd-end-emblem', 'aria-hidden': 'true' });
  node.innerHTML = EMBLEM_SVG;
  return node;
}

const TITLES: Record<EndReason, { win: string; other: string }> = {
  solved: { win: 'Case solved!', other: 'Case closed' },
  unsolved: { win: 'Case gone cold', other: 'Case gone cold' },
  abandoned: { win: 'Case abandoned', other: 'Case abandoned' },
};

/**
 * Everything layered over the table: toasts, the polite live region that narrates every event,
 * the banner layer, and the end screen with the case file and New case.
 */
export class Overlay {
  readonly bannerLayer: HTMLElement;
  readonly toastEl: HTMLElement;
  readonly live: HTMLElement;
  readonly end: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly endLine: HTMLElement;
  private readonly endSolution: HTMLElement;
  private readonly endSolutionLine: HTMLElement;
  private readonly newGameButton: HTMLButtonElement;
  private readonly endNote: HTMLElement;
  private readonly recapButton: HTMLButtonElement;
  private readonly recapSlot: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private endKey = '';

  constructor(intents: EndIntents) {
    this.bannerLayer = h('div', { class: 'wd-banners', 'aria-hidden': 'true' });
    this.toastEl = h('div', { class: 'wd-toast', role: 'status', 'aria-live': 'polite', hidden: true });
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });

    this.endTitle = h('h2', { class: 'wd-end-title', id: 'wd-end-title' });
    this.endLine = h('p', { class: 'wd-end-line' });
    this.endSolution = h('div', { class: 'wd-end-solution', 'data-testid': 'end-solution' });
    this.endSolutionLine = h('p', { class: 'wd-end-solution-line' });
    this.newGameButton = h('button', { type: 'button', class: 'wd-btn wd-btn-primary', 'data-testid': 'new-case' }, 'New case');
    this.newGameButton.addEventListener('click', () => intents.newGame());
    this.endNote = h('p', { class: 'wd-end-note', role: 'status' });
    this.recapButton = h('button', { type: 'button', class: 'wd-btn', 'aria-expanded': 'false', 'data-testid': 'recap-toggle' }, 'Open the case file');
    this.recapSlot = h('div', { class: 'wd-end-report', hidden: true });
    this.recapButton.addEventListener('click', () => {
      const open = this.recapSlot.hidden;
      this.recapSlot.hidden = !open;
      this.recapButton.setAttribute('aria-expanded', String(open));
    });
    const viewBoard = h('button', { type: 'button', class: 'wd-btn wd-btn-quiet' }, 'View the board');
    viewBoard.addEventListener('click', () => this.minimizeEnd(true));
    const restore = h('button', { type: 'button', class: 'wd-btn wd-end-restore' }, 'Case closed');
    restore.addEventListener('click', () => this.minimizeEnd(false));
    this.end = h(
      'section',
      { class: 'wd-end', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'wd-end-title', hidden: true, 'data-testid': 'end-dialog' },
      h(
        'div',
        { class: 'wd-end-card' },
        emblem(),
        this.endTitle,
        this.endLine,
        this.endSolution,
        this.endSolutionLine,
        h('div', { class: 'wd-end-actions' }, this.newGameButton, this.recapButton, viewBoard),
        this.endNote,
        this.recapSlot,
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

  /** Narrates for screen readers: "Inspector suggests Captain Rook with the Poison Vial in the Wine Cellar." */
  announce(text: string): void {
    // Clearing first makes a repeated message read again.
    this.live.textContent = '';
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
    }
    this.liveTimer = setTimeout(() => {
      this.live.textContent = text;
    }, 30);
  }

  showEnd(state: EndState): void {
    const key = `${state.won}:${state.reason}:${state.line}`;
    if (this.endKey !== key) {
      this.endKey = key;
      this.end.dataset.minimized = 'false';
      this.recapSlot.hidden = true;
      this.recapButton.setAttribute('aria-expanded', 'false');
    }
    this.end.hidden = false;
    this.end.dataset.result = state.won ? 'win' : state.reason === 'solved' ? 'lose' : 'cold';
    const titles = state.reason ? TITLES[state.reason] : null;
    setText(this.endTitle, titles ? (state.won ? titles.win : titles.other) : 'Case closed');
    setText(this.endLine, state.line);
    const solutionKey = state.solution ? `${state.solution.suspect}:${state.solution.weapon}:${state.solution.room}` : '';
    if (this.endSolution.dataset.key !== solutionKey) {
      this.endSolution.dataset.key = solutionKey;
      this.endSolution.replaceChildren(
        ...(state.solution ? [cardFace(state.solution.suspect), cardFace(state.solution.weapon), cardFace(state.solution.room)] : []),
      );
    }
    setText(this.endSolutionLine, state.solution ? `It was ${solutionLine(state.solution)}.` : '');
    this.newGameButton.hidden = !state.canNewGame;
    setText(this.endNote, state.canNewGame ? '' : `Waiting for ${state.hostName ?? 'the host'} to open a new case.`);
    this.recapButton.hidden = !state.recap;
    if (state.recap) {
      const signature = `${state.recap.events.length}:${state.recap.endedAt}`;
      if (this.recapSlot.dataset.signature !== signature) {
        this.recapSlot.dataset.signature = signature;
        this.recapSlot.replaceChildren(renderRecap(state.recap, state.seats, state.me));
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
