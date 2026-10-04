import { squareKey } from '../rules/board.js';
import type { Tile } from '../rules/types.js';
import type { TableSnapshot } from '../runtime/types.js';
import { themeFor, type Theme } from '../themes/index.js';
import { fitCamera, resizeCamera, type CameraState } from './camera.js';
import { EMPTY_DRAFT, rackView, type Draft } from './draft.js';
import { layoutFor, type Layout } from './layout.js';
import type { TimelineStep } from './score-timeline.js';

export type ChangeKind = 'snapshot' | 'draft' | 'theme' | 'drag' | 'camera' | 'layout' | 'selection';

export interface DragState {
  tileId: string;
  from: 'rack' | 'draft';
  x: number;
  y: number;
  /** Square the tile would land on, when it is free. */
  target: { row: number; col: number } | null;
}

/**
 * Everything the scenes and the DOM overlay draw from. Scenes never hold game state of
 * their own; they redraw from this when it tells them what changed.
 */
export class TableModel {
  snapshot: TableSnapshot | null = null;
  draft: Draft = EMPTY_DRAFT;
  theme: Theme = themeFor('default');
  drag: DragState | null = null;
  /** Tap-to-place: a rack tile picked by tapping, waiting for a square tap. */
  selectedTileId: string | null = null;
  /** Rack tiles marked for exchange; null when not exchanging. */
  exchange: Set<string> | null = null;
  layout: Layout;
  camera: CameraState;
  /** Score held back for the seat whose play is still being counted on screen. */
  pendingScore: { seatId: string; hold: number } | null = null;
  /** Labels of the last count, in order. Read by the dev test hooks. */
  timelineLog: string[] = [];

  private occupiedSquares = new Set<string>();
  private listeners = new Set<(kind: ChangeKind) => void>();
  private beatListeners = new Set<(step: TimelineStep) => void>();

  constructor(width: number, height: number, readonly unit = 1) {
    this.layout = layoutFor(width, height, unit);
    this.camera = fitCamera(this.layout.board);
  }

  on(listener: (kind: ChangeKind) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onBeat(listener: (step: TimelineStep) => void): () => void {
    this.beatListeners.add(listener);
    return () => this.beatListeners.delete(listener);
  }

  emit(kind: ChangeKind): void {
    for (const listener of this.listeners) {
      listener(kind);
    }
  }

  beat(step: TimelineStep): void {
    this.timelineLog.push(step.kind === 'highlight' ? `highlight ${step.words.join(' ')}` : step.label);
    for (const listener of this.beatListeners) {
      listener(step);
    }
  }

  setSnapshot(snapshot: TableSnapshot): void {
    const themeChanged = snapshot.themeId !== this.theme.id;
    this.snapshot = snapshot;
    this.occupiedSquares = new Set(snapshot.board.map((tile) => squareKey(tile.row, tile.col)));
    if (themeChanged) {
      this.theme = themeFor(snapshot.themeId);
    }
    this.emit('snapshot');
    if (themeChanged) {
      this.emit('theme');
    }
  }

  resize(width: number, height: number): void {
    const next = layoutFor(width, height, this.unit);
    this.camera = resizeCamera(this.camera, this.layout.board, next.board);
    this.layout = next;
    this.emit('layout');
  }

  get rack(): Tile[] {
    return this.snapshot?.you?.rack ?? [];
  }

  get rackTiles(): Tile[] {
    return rackView(this.draft, this.rack);
  }

  get mySeatId(): string | null {
    return this.snapshot?.you?.seatId ?? null;
  }

  get isMyTurn(): boolean {
    return !!this.snapshot && this.snapshot.status === 'playing' && this.snapshot.currentSeatId === this.mySeatId;
  }

  get canDraft(): boolean {
    return !!this.snapshot?.you && this.snapshot.status === 'playing' && this.rack.length > 0;
  }

  readonly occupied = (row: number, col: number): boolean => this.occupiedSquares.has(squareKey(row, col));

  displayScore(seatId: string, score: number): number {
    return this.pendingScore?.seatId === seatId ? score - this.pendingScore.hold : score;
  }
}
