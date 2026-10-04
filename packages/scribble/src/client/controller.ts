import { EXCHANGE_MIN_BAG } from '../rules/limits.js';
import type { Placement, PlacementError } from '../rules/types.js';
import type { ErrorMessage, TableSnapshot } from '../runtime/types.js';
import type { ThemeId } from '../themes/ids.js';
import { isZoomedIn, panBy, screenToWorld, wheelFactor, zoomAt, fitCamera } from './camera.js';
import {
  draftPlacements,
  draftTileAt,
  moveInRack,
  pickUp,
  placeTile,
  placedCount,
  recallAll,
  setBlankLetter,
  shuffleRack,
  syncDraft,
} from './draft.js';
import { IDLE, stepGesture, type GestureEffect, type GestureState, type GestureTarget } from './gestures.js';
import { cellAt, contains, nearestRackSlot, rackSlotAt } from './layout.js';
import type { TableModel } from './model.js';
import { buildTimeline } from './score-timeline.js';

export interface SessionPort {
  readonly seated: boolean;
  play(placements: Placement[]): void;
  pass(): void;
  exchange(tileIds: string[]): void;
  startGame(): void;
  setTheme(themeId: ThemeId): void;
  leave(): void;
  sit(): void;
}

export interface ControllerUi {
  /** Resolves with the chosen letter, or null when the player backs out. */
  pickBlank(): Promise<string | null>;
  toast(text: string, tone?: 'info' | 'error'): void;
}

const PLACEMENT_MESSAGES: Partial<Record<PlacementError, string>> = {
  not_in_line: 'Tiles must sit in one straight line.',
  gap: 'A word cannot have gaps.',
  must_cover_center: 'The first word must cover the centre square.',
  too_short: 'The first word needs at least two letters.',
  not_connected: 'Your word must touch tiles already on the board.',
  occupied: 'That square is already taken.',
  blank_letter_required: 'Choose a letter for the blank.',
};

const ERROR_MESSAGES: Record<string, string> = {
  off_turn: "It's not your turn.",
  exchange_unavailable: `Exchanging needs at least ${EXCHANGE_MIN_BAG} tiles in the bag.`,
  table_full: "The table is full. You're watching.",
  account_already_seated: 'Your account is already seated at this table.',
  invalid_access_token: "Your sign-in couldn't be verified. Refresh to try again.",
  identity_unavailable: 'Sign-in checks are unavailable right now. Try again shortly.',
  insufficient_players: 'Two players are needed to start.',
  game_in_progress: 'A game is already under way.',
  version_conflict: 'The table was busy. Try again.',
  not_seated: "You're not seated.",
  invalid_seat_token: "You're not seated.",
  game_not_in_progress: 'No game is running.',
};

export function describeError(error: ErrorMessage): string {
  if (error.code === 'invalid_word') {
    const words = error.words ?? [];
    return words.length === 1 ? `${words[0]} is not in the word list.` : `Not in the word list: ${words.join(', ')}.`;
  }
  if (error.code === 'invalid_placement') {
    return (error.reason && PLACEMENT_MESSAGES[error.reason]) ?? "Those tiles can't go there.";
  }
  return ERROR_MESSAGES[error.code] ?? 'That move was not accepted.';
}

type Schedule = (fn: () => void, ms: number) => unknown;

/**
 * Turns pointer input into draft edits, camera moves, and session actions, and plays the
 * score count when a new play arrives. Owns no Phaser objects, so it runs in plain tests.
 */
export class TableController {
  private gesture: GestureState = IDLE;
  private lastTurnSeen: number | null = null;
  private timelineToken = 0;

  constructor(
    private readonly model: TableModel,
    private readonly session: SessionPort,
    private readonly ui: ControllerUi,
    private readonly options: {
      random?: { int(max: number): number };
      schedule?: Schedule;
      reducedMotion?: () => boolean;
    } = {},
  ) {}

  onSnapshot(snapshot: TableSnapshot): void {
    const previous = this.model.snapshot;
    this.model.setSnapshot(snapshot);
    const before = this.model.draft;
    this.model.draft = syncDraft(before, this.model.rack, this.model.occupied);
    if (this.model.selectedTileId && !this.model.rackTiles.some((t) => t.id === this.model.selectedTileId)) {
      this.model.selectedTileId = null;
    }
    if (this.model.exchange && (snapshot.status !== 'playing' || !snapshot.you)) {
      this.model.exchange = null;
      this.model.emit('selection');
    }
    if (snapshot.status !== 'playing' && placedCount(this.model.draft) > 0) {
      this.model.draft = recallAll(this.model.draft);
    }
    this.model.emit('draft');

    const turn = snapshot.lastTurn;
    if (this.lastTurnSeen === null || (previous && previous.tableId !== snapshot.tableId)) {
      this.lastTurnSeen = turn?.turnNumber ?? 0;
      return;
    }
    if (turn && turn.turnNumber > this.lastTurnSeen) {
      this.lastTurnSeen = turn.turnNumber;
      this.announce(snapshot);
    }
  }

  onError(error: ErrorMessage): void {
    this.ui.toast(describeError(error), 'error');
  }

  private announce(snapshot: TableSnapshot): void {
    const turn = snapshot.lastTurn!;
    const name = snapshot.seats.find((seat) => seat.seatId === turn.seatId)?.displayName ?? 'A player';
    const who = turn.seatId === this.model.mySeatId ? 'You' : name;
    if (turn.kind === 'pass') {
      this.ui.toast(`${who} passed.`);
    } else if (turn.kind === 'auto_pass') {
      this.ui.toast(`${name} left on their turn; it passed.`);
    } else if (turn.kind === 'exchange') {
      this.ui.toast(`${who} exchanged ${turn.exchanged} tile${turn.exchanged === 1 ? '' : 's'}.`);
    } else {
      this.playTimeline(snapshot);
    }
  }

  private playTimeline(snapshot: TableSnapshot): void {
    const turn = snapshot.lastTurn!;
    const steps = buildTimeline(turn, { reducedMotion: this.options.reducedMotion?.() ?? false });
    const schedule = this.options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    const token = ++this.timelineToken;
    this.model.timelineLog = [];
    this.model.pendingScore = { seatId: turn.seatId, hold: turn.total };
    this.model.emit('snapshot');
    let at = 0;
    for (const step of steps) {
      schedule(() => {
        if (token !== this.timelineToken) {
          return;
        }
        if (step.kind === 'total') {
          this.model.pendingScore = null;
          this.model.emit('snapshot');
        }
        this.model.beat(step);
      }, at);
      at += step.ms;
    }
  }

  // Pointer input, in canvas pixels.

  pointerDown(id: number, x: number, y: number): void {
    this.apply(stepGesture(this.gesture, { type: 'down', id, x, y, target: this.hitTest(x, y) }));
  }

  pointerMove(id: number, x: number, y: number): void {
    this.apply(stepGesture(this.gesture, { type: 'move', id, x, y }));
  }

  pointerUp(id: number, x: number, y: number): void {
    this.apply(stepGesture(this.gesture, { type: 'up', id, x, y }));
  }

  pointerCancel(): void {
    this.apply(stepGesture(this.gesture, { type: 'cancel' }));
  }

  wheel(x: number, y: number, deltaY: number): void {
    const { board } = this.model.layout;
    if (!contains(board, x, y)) {
      return;
    }
    this.model.camera = zoomAt(this.model.camera, board, wheelFactor(deltaY), x, y);
    this.model.emit('camera');
  }

  zoomBy(factor: number): void {
    const { board } = this.model.layout;
    this.model.camera = zoomAt(this.model.camera, board, factor, board.x + board.width / 2, board.y + board.height / 2);
    this.model.emit('camera');
  }

  resetZoom(): void {
    this.model.camera = fitCamera(this.model.layout.board);
    this.model.emit('camera');
  }

  private hitTest(x: number, y: number): GestureTarget {
    const { layout } = this.model;
    const rack = this.model.rackTiles;
    const slot = rackSlotAt(layout, x, y, rack.length);
    if (slot !== null && this.model.snapshot?.you) {
      return { kind: 'rack', tileId: rack[slot]!.id };
    }
    if (contains(layout.board, x, y)) {
      const cell = this.cellUnder(x, y);
      const tileId = cell ? draftTileAt(this.model.draft, cell.row, cell.col) : null;
      return tileId ? { kind: 'draft', tileId } : { kind: 'board' };
    }
    return { kind: 'none' };
  }

  private cellUnder(x: number, y: number): { row: number; col: number } | null {
    const { layout, camera } = this.model;
    if (!contains(layout.board, x, y)) {
      return null;
    }
    const world = screenToWorld(camera, layout.board, x, y);
    return cellAt(world.x, world.y);
  }

  private freeCellUnder(x: number, y: number, tileId: string): { row: number; col: number } | null {
    const cell = this.cellUnder(x, y);
    if (!cell || this.model.occupied(cell.row, cell.col)) {
      return null;
    }
    const holder = draftTileAt(this.model.draft, cell.row, cell.col);
    return holder && holder !== tileId ? null : cell;
  }

  private apply(step: { state: GestureState; effects: GestureEffect[] }): void {
    this.gesture = step.state;
    for (const effect of step.effects) {
      this.handle(effect);
    }
  }

  private handle(effect: GestureEffect): void {
    const model = this.model;
    switch (effect.type) {
      case 'drag_start':
        if (!model.canDraft || model.exchange) {
          this.gesture = IDLE;
          return;
        }
        if (effect.from === 'draft') {
          model.draft = pickUp(model.draft, effect.tileId);
          model.emit('draft');
        }
        model.selectedTileId = null;
        model.drag = { tileId: effect.tileId, from: effect.from, x: effect.x, y: effect.y, target: null };
        model.emit('drag');
        return;
      case 'drag_move':
        if (!model.drag) {
          return;
        }
        model.drag = { ...model.drag, x: effect.x, y: effect.y, target: this.freeCellUnder(effect.x, effect.y, effect.tileId) };
        model.emit('drag');
        return;
      case 'drop': {
        if (!model.drag) {
          return;
        }
        const target = this.freeCellUnder(effect.x, effect.y, effect.tileId);
        model.drag = null;
        if (target) {
          this.placeAt(effect.tileId, target.row, target.col);
        } else if (contains(model.layout.rack, effect.x, effect.y)) {
          const visible = model.rackTiles.filter((tile) => tile.id !== effect.tileId).length + 1;
          model.draft = moveInRack(model.draft, effect.tileId, nearestRackSlot(model.layout, effect.x, visible));
        }
        model.emit('drag');
        model.emit('draft');
        return;
      }
      case 'drag_cancel':
        model.drag = null;
        model.emit('drag');
        model.emit('draft');
        return;
      case 'pan':
        if (isZoomedIn(model.camera, model.layout.board)) {
          model.camera = panBy(model.camera, model.layout.board, effect.dx, effect.dy);
          model.emit('camera');
        }
        return;
      case 'pinch':
        model.camera = zoomAt(model.camera, model.layout.board, effect.factor, effect.x, effect.y);
        model.emit('camera');
        return;
      case 'tap':
        this.tap(effect.target, effect.x, effect.y);
        return;
    }
  }

  private tap(target: GestureTarget, x: number, y: number): void {
    const model = this.model;
    if (target.kind === 'rack') {
      if (model.exchange) {
        const next = new Set(model.exchange);
        if (next.has(target.tileId)) {
          next.delete(target.tileId);
        } else {
          next.add(target.tileId);
        }
        model.exchange = next;
      } else if (model.canDraft) {
        model.selectedTileId = model.selectedTileId === target.tileId ? null : target.tileId;
      }
      model.emit('selection');
      return;
    }
    if (target.kind === 'draft') {
      const tile = model.rack.find((t) => t.id === target.tileId);
      if (tile?.letter === null) {
        void this.chooseBlank(target.tileId, false);
      } else {
        model.draft = pickUp(model.draft, target.tileId);
        model.emit('draft');
      }
      return;
    }
    if (target.kind === 'board' && model.selectedTileId) {
      const cell = this.freeCellUnder(x, y, model.selectedTileId);
      if (cell) {
        const tileId = model.selectedTileId;
        model.selectedTileId = null;
        this.placeAt(tileId, cell.row, cell.col);
        model.emit('selection');
      }
    }
  }

  private placeAt(tileId: string, row: number, col: number): void {
    const next = placeTile(this.model.draft, tileId, row, col, this.model.occupied);
    if (!next) {
      return;
    }
    this.model.draft = next;
    this.model.emit('draft');
    const tile = this.model.rack.find((t) => t.id === tileId);
    if (tile && tile.letter === null && !next.placed[tileId]?.letter) {
      void this.chooseBlank(tileId, true);
    }
  }

  /** A blank's letter can change any time before Play; backing out of a fresh drop returns it. */
  private async chooseBlank(tileId: string, returnOnCancel: boolean): Promise<boolean> {
    const letter = await this.ui.pickBlank();
    if (letter) {
      this.model.draft = setBlankLetter(this.model.draft, tileId, letter);
    } else if (returnOnCancel) {
      this.model.draft = pickUp(this.model.draft, tileId);
    }
    this.model.emit('draft');
    return letter !== null;
  }

  // Turn controls.

  async play(): Promise<void> {
    if (!this.model.isMyTurn) {
      this.ui.toast("It's not your turn.", 'error');
      return;
    }
    if (placedCount(this.model.draft) === 0) {
      this.ui.toast('Drag tiles onto the board first.', 'error');
      return;
    }
    const result = draftPlacements(this.model.draft, this.model.rack);
    if (!result.ok) {
      if (await this.chooseBlank(result.blankTileId, false)) {
        await this.play();
      }
      return;
    }
    this.session.play(result.placements);
  }

  recall(): void {
    this.model.draft = recallAll(this.model.draft);
    this.model.selectedTileId = null;
    this.model.emit('draft');
  }

  shuffle(): void {
    this.model.draft = shuffleRack(this.model.draft, this.options.random ?? { int: (max) => Math.floor(Math.random() * max) });
    this.model.emit('draft');
  }

  pass(): void {
    this.recall();
    this.session.pass();
  }

  beginExchange(): void {
    if (!this.model.isMyTurn) {
      this.ui.toast("It's not your turn.", 'error');
      return;
    }
    if ((this.model.snapshot?.bagCount ?? 0) < EXCHANGE_MIN_BAG) {
      this.ui.toast(ERROR_MESSAGES.exchange_unavailable!, 'error');
      return;
    }
    this.recall();
    this.model.exchange = new Set();
    this.model.emit('selection');
  }

  confirmExchange(): void {
    const chosen = this.model.exchange ? [...this.model.exchange] : [];
    if (chosen.length === 0) {
      this.ui.toast('Tap the tiles you want to swap.', 'error');
      return;
    }
    this.model.exchange = null;
    this.model.emit('selection');
    this.session.exchange(chosen);
  }

  cancelExchange(): void {
    this.model.exchange = null;
    this.model.emit('selection');
  }

  start(): void {
    this.session.startGame();
  }

  setTheme(themeId: ThemeId): void {
    this.session.setTheme(themeId);
  }

  leave(): void {
    this.recall();
    this.session.leave();
  }

  sit(): void {
    this.session.sit();
  }
}
