import { BOARD_SIZE, COL_LABELS, ROW_LABELS, SHIP_LENGTH, SHIP_NAME } from '../../rules/constants.js';
import type { Coord, ShipId, ShipPlacement } from '../../rules/types.js';
import { svg } from '../fx/animate.js';
import type { BoardFxSurface } from '../fx/sonar.js';
import { GUTTER, VIEW_SIZE } from '../fx/timeline.js';
import type { BoardModel, ShipView } from '../view-model.js';
import { hullSvg } from './hull.js';

export type ShipState = 'afloat' | 'sunk' | 'revealed' | 'draft' | 'lifted' | 'carrying';

export interface ShipRender {
  placement: ShipPlacement;
  state: ShipState;
  /** Placement only: the ship is a button that can be picked up. */
  interactive?: boolean;
  invalid?: boolean;
  /** Finale stagger order for revealed ships. */
  order?: number;
}

export interface BoardRenderOptions {
  /** Target board: the cells are fire buttons. */
  interactive: boolean;
  /** Why the cells are disabled, for the status line and `aria-disabled`. */
  disabledReason?: string | null;
  /** The shooter's own reticle while their `fire` is in flight. */
  pending?: Coord | null;
}

const pct = (units: number) => `${((units / VIEW_SIZE) * 100).toFixed(4)}%`;
const keyOf = (coord: Coord) => coord.row * BOARD_SIZE + coord.col;

export function shipStyle(placement: ShipPlacement): { left: string; top: string; width: string; height: string } {
  const length = SHIP_LENGTH[placement.shipId];
  return {
    left: pct(GUTTER + placement.col),
    top: pct(GUTTER + placement.row),
    width: pct(placement.orientation === 'horizontal' ? length : 1),
    height: pct(placement.orientation === 'horizontal' ? 1 : length),
  };
}

function shipStateOf(view: ShipView): ShipState {
  return view.sunk ? 'sunk' : view.revealed ? 'revealed' : 'afloat';
}

/**
 * One 10×10 ocean with its A–J / 1–10 coordinate markers, a ship layer, and an SVG overlay in
 * board units for the shot effects. Your own board is plain cells; the target board's cells are
 * buttons in a roving-tabindex grid (arrow keys move, Enter fires).
 */
export class BoardView implements BoardFxSurface {
  readonly root: HTMLElement;
  readonly frame: HTMLElement;
  readonly grid: HTMLElement;
  readonly cells: HTMLElement[][] = [];
  readonly rowMarkers: HTMLElement[] = [];
  readonly colMarkers: HTMLElement[] = [];
  readonly shipsLayer: HTMLElement;
  readonly fx: SVGSVGElement;
  private readonly shipEls = new Map<ShipId, HTMLElement>();
  private readonly known = new Set<number>();
  private rendered = false;
  private focus: Coord = { row: 0, col: 0 };
  private interactive = false;
  onFire: ((coord: Coord) => void) | null = null;
  onCellClick: ((coord: Coord) => void) | null = null;

  constructor(
    readonly mode: 'own' | 'target',
    label: string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ws-board';
    this.root.dataset.mode = mode;
    this.frame = document.createElement('div');
    this.frame.className = 'ws-board-frame';
    this.grid = document.createElement('div');
    this.grid.className = 'ws-grid';
    this.grid.setAttribute('role', 'grid');
    this.grid.setAttribute('aria-label', label);

    const head = document.createElement('div');
    head.className = 'ws-row ws-row-head';
    head.setAttribute('role', 'row');
    const corner = document.createElement('span');
    corner.className = 'ws-corner';
    corner.setAttribute('role', 'presentation');
    head.append(corner);
    for (let col = 0; col < BOARD_SIZE; col++) {
      const marker = this.marker(COL_LABELS[col]!, 'columnheader');
      marker.dataset.col = String(col);
      this.colMarkers.push(marker);
      head.append(marker);
    }
    this.grid.append(head);

    for (let row = 0; row < BOARD_SIZE; row++) {
      const line = document.createElement('div');
      line.className = 'ws-row';
      line.setAttribute('role', 'row');
      const marker = this.marker(ROW_LABELS[row]!, 'rowheader');
      marker.dataset.row = String(row);
      this.rowMarkers.push(marker);
      line.append(marker);
      const cells: HTMLElement[] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement(mode === 'target' ? 'button' : 'div');
        cell.className = 'ws-cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        if (cell instanceof HTMLButtonElement) {
          cell.type = 'button';
          cell.tabIndex = row === 0 && col === 0 ? 0 : -1;
        }
        cells.push(cell);
        line.append(cell);
      }
      this.cells.push(cells);
      this.grid.append(line);
    }

    this.shipsLayer = document.createElement('div');
    this.shipsLayer.className = 'ws-ships';
    this.fx = svg('svg', { class: 'ws-fx', viewBox: `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`, 'aria-hidden': 'true', focusable: 'false' });
    this.fx.append(this.defs());
    const idle = document.createElement('div');
    idle.className = 'ws-idle-sweep';
    idle.setAttribute('aria-hidden', 'true');
    const scan = document.createElement('div');
    scan.className = 'ws-scanlines';
    scan.setAttribute('aria-hidden', 'true');

    this.frame.append(this.grid, this.shipsLayer, idle, this.fx, scan);
    this.root.append(this.frame);

    this.grid.addEventListener('click', (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('.ws-cell');
      if (!cell) {
        return;
      }
      const coord = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      this.onCellClick?.(coord);
      if (this.mode === 'target') {
        this.moveFocus(coord, false);
        this.tryFire(coord);
      }
    });
    if (mode === 'target') {
      this.grid.addEventListener('keydown', (event) => this.onKey(event));
    }
  }

  private marker(text: string, role: string): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'ws-marker';
    marker.setAttribute('role', role);
    const label = document.createElement('span');
    label.className = 'ws-marker-text';
    label.textContent = text;
    const glow = document.createElement('span');
    glow.className = 'ws-marker-glow';
    glow.setAttribute('aria-hidden', 'true');
    marker.append(glow, label);
    return marker;
  }

  private defs(): SVGDefsElement {
    const burst = svg(
      'radialGradient',
      { id: `ws-burst-${this.mode}` },
      svg('stop', { offset: '0%', 'stop-color': '#fff6d8' }),
      svg('stop', { offset: '35%', 'stop-color': '#ffb347' }),
      svg('stop', { offset: '70%', 'stop-color': '#ff6a3d', 'stop-opacity': '0.65' }),
      svg('stop', { offset: '100%', 'stop-color': '#ff3d1f', 'stop-opacity': '0' }),
    );
    const clip = svg('clipPath', { id: `ws-clip-${this.mode}` }, svg('rect', { x: 0, y: 0, width: VIEW_SIZE, height: VIEW_SIZE, rx: 0.3 }));
    return svg('defs', {}, burst, clip);
  }

  /**
   * Explored cells never fire. Otherwise the controller decides with a fresh view model: the
   * last render can be a few ms behind the turn opening, and that click must not be lost.
   */
  private tryFire(coord: Coord): void {
    const cell = this.cells[coord.row]?.[coord.col];
    if (!cell || cell.dataset.mark) {
      return;
    }
    this.onFire?.(coord);
  }

  private onKey(event: KeyboardEvent): void {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      this.moveFocus(
        {
          row: Math.min(BOARD_SIZE - 1, Math.max(0, this.focus.row + move[0])),
          col: Math.min(BOARD_SIZE - 1, Math.max(0, this.focus.col + move[1])),
        },
        true,
      );
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.moveFocus({ row: this.focus.row, col: event.key === 'Home' ? 0 : BOARD_SIZE - 1 }, true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.tryFire(this.focus);
    }
  }

  moveFocus(coord: Coord, focus: boolean): void {
    const prev = this.cells[this.focus.row]?.[this.focus.col];
    if (prev) {
      prev.tabIndex = -1;
    }
    this.focus = coord;
    const next = this.cells[coord.row]?.[coord.col];
    if (next) {
      next.tabIndex = 0;
      if (focus) {
        next.focus();
      }
    }
  }

  get focusedCell(): Coord {
    return { ...this.focus };
  }

  render(model: BoardModel, options: BoardRenderOptions): void {
    this.interactive = this.mode === 'target' && options.interactive;
    this.root.dataset.interactive = this.interactive ? 'true' : 'false';
    const disabled = this.mode === 'target' && !this.interactive;
    for (const line of model.cells) {
      for (const view of line) {
        const cell = this.cells[view.row]![view.col]!;
        const k = keyOf(view);
        if (view.mark) {
          if (cell.dataset.mark !== view.mark) {
            cell.dataset.mark = view.mark;
            cell.replaceChildren(this.peg(view.mark, this.rendered && !this.known.has(k)));
          }
          this.known.add(k);
        } else if (cell.dataset.mark) {
          delete cell.dataset.mark;
          cell.replaceChildren();
          this.known.delete(k);
        }
        cell.dataset.ship = view.ship ?? '';
        cell.dataset.sunk = view.sunk ? 'true' : 'false';
        if (cell.getAttribute('aria-label') !== view.label) {
          cell.setAttribute('aria-label', view.label);
        }
        if (this.mode === 'target') {
          const blocked = disabled || view.mark !== null;
          cell.setAttribute('aria-disabled', blocked ? 'true' : 'false');
          const pending = options.pending && options.pending.row === view.row && options.pending.col === view.col;
          if (pending) {
            cell.dataset.pending = 'true';
          } else {
            delete cell.dataset.pending;
          }
        }
      }
    }
    if (this.mode === 'target') {
      if (disabled && options.disabledReason) {
        this.grid.setAttribute('aria-description', options.disabledReason);
      } else {
        this.grid.removeAttribute('aria-description');
      }
    }
    this.renderShips(
      model.ships.map((ship) => ({ placement: ship.placement, state: shipStateOf(ship) })),
    );
    this.rendered = true;
  }

  private peg(result: 'hit' | 'miss', fresh: boolean): HTMLElement {
    const peg = document.createElement('span');
    peg.className = 'ws-peg';
    peg.dataset.result = result;
    if (fresh) {
      peg.dataset.fresh = 'true';
    }
    peg.setAttribute('aria-hidden', 'true');
    if (result === 'hit') {
      const flame = document.createElement('span');
      flame.className = 'ws-flame';
      peg.append(flame);
    }
    return peg;
  }

  /** Ships are kept by id and moved in place, so a focused ship keeps focus while it moves. */
  renderShips(ships: ShipRender[]): void {
    const wanted = new Set<ShipId>();
    for (const ship of ships) {
      const { placement } = ship;
      wanted.add(placement.shipId);
      let el = this.shipEls.get(placement.shipId);
      const interactive = Boolean(ship.interactive);
      if (el && (el.tagName === 'BUTTON') !== interactive) {
        el.remove();
        this.shipEls.delete(placement.shipId);
        el = undefined;
      }
      if (!el) {
        el = document.createElement(interactive ? 'button' : 'div');
        el.className = 'ws-ship';
        el.dataset.ship = placement.shipId;
        if (el instanceof HTMLButtonElement) {
          el.type = 'button';
        } else {
          el.setAttribute('aria-hidden', 'true');
        }
        this.shipsLayer.append(el);
        this.shipEls.set(placement.shipId, el);
      }
      if (el.dataset.orientation !== placement.orientation) {
        el.dataset.orientation = placement.orientation;
        el.replaceChildren(hullSvg(placement.shipId, placement.orientation));
      }
      Object.assign(el.style, shipStyle(placement));
      el.dataset.state = ship.state;
      el.dataset.invalid = ship.invalid ? 'true' : 'false';
      if (ship.order !== undefined) {
        el.style.setProperty('--ws-order', String(ship.order));
      }
      if (interactive) {
        el.setAttribute('aria-label', `${SHIP_NAME[placement.shipId]}, placed. Enter to move, R to rotate.`);
      }
    }
    for (const [shipId, el] of this.shipEls) {
      if (!wanted.has(shipId)) {
        el.remove();
        this.shipEls.delete(shipId);
      }
    }
  }

  shipElement(shipId: ShipId): HTMLElement | null {
    return this.shipEls.get(shipId) ?? null;
  }

  /** Placement preview outlines: cyan where it fits, red where it does not. */
  preview(cells: Coord[], valid: boolean): void {
    this.clearPreview();
    for (const coord of cells) {
      const cell = this.cells[coord.row]?.[coord.col];
      if (cell) {
        cell.dataset.preview = valid ? 'valid' : 'invalid';
      }
    }
  }

  clearPreview(): void {
    for (const line of this.cells) {
      for (const cell of line) {
        delete cell.dataset.preview;
      }
    }
  }

  /** Viewport rect of cell A1, the origin for pointer → cell math. */
  originRect(): DOMRect {
    return this.cells[0]![0]!.getBoundingClientRect();
  }

  cellPoint(coord: Coord): { x: number; y: number } {
    const rect = this.cells[coord.row]![coord.col]!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
}
