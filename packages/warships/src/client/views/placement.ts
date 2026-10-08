import { FLEET, SHIP_LENGTH, SHIP_NAME } from '../../rules/constants.js';
import { shipCells } from '../../rules/fleet.js';
import { mathRandom } from '../../rules/random.js';
import type { Fleet, Orientation, ShipId, ShipPlacement } from '../../rules/types.js';
import {
  clampToBoard,
  completeFleet,
  describePlacement,
  draftFromFleet,
  EMPTY_DRAFT,
  fits,
  grabOffset,
  moved,
  place,
  placedCount,
  placedShips,
  randomDraft,
  rotated,
  snapBow,
  type Draft,
} from '../draft.js';
import { EASE_OUT } from '../fx/animate.js';
import type { BoardView, ShipRender } from './board.js';
import { hullSvg } from './hull.js';

export interface PlacementHost {
  draft(): Draft;
  setDraft(draft: Draft): void;
  ready(fleet: Fleet): void;
  unready(): void;
  announce(text: string): void;
  reducedMotion(): boolean;
  lastFleet(): Fleet | null;
}

export interface PlacementState {
  /** Fleet locked in on the server. */
  ready: boolean;
  opponentReady: boolean;
  opponentName: string;
  canUnready: boolean;
}

interface Carry {
  shipId: ShipId;
  /** Where the ship was before it was picked up; null from the tray. */
  origin: ShipPlacement | null;
  candidate: ShipPlacement | null;
  orientation: Orientation;
  mode: 'pointer' | 'keyboard';
  grab: { row: number; col: number };
  pointerId?: number;
  startX: number;
  startY: number;
  moved: boolean;
  ghost?: HTMLElement;
  /** Grab point inside the ghost, px. */
  ghostGrab?: { x: number; y: number };
}

const TAP_SLOP_PX = 6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function shake(target: Element | undefined | null, reduced: boolean): void {
  if (!target || reduced || typeof target.animate !== 'function') {
    return;
  }
  target.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 200, easing: 'ease-in-out', composite: 'add' },
  );
}

/**
 * Arranging the fleet: drag hulls from the tray onto your board (they snap to cells and show
 * cyan or red outlines), tap or right-click or press R to rotate on the bow, Randomize, Clear,
 * Reuse last fleet, then Ready. Keyboard: Enter picks a ship up, arrows move, R rotates, Enter
 * drops, Escape cancels.
 */
export class PlacementView {
  readonly panel: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly trayItems = new Map<ShipId, HTMLButtonElement>();
  private readonly readyButton: HTMLButtonElement;
  private readonly editButton: HTMLButtonElement;
  private readonly rotateButton: HTMLButtonElement;
  private readonly randomButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly reuseButton: HTMLButtonElement;
  private readonly opponentChip: HTMLElement;
  private readonly hint: HTMLElement;
  private carry: Carry | null = null;
  private selected: ShipId | null = null;
  /** Tap a tray ship, then tap a cell: the touch-friendly path. */
  private armed: ShipId | null = null;
  private state: PlacementState = { ready: false, opponentReady: false, opponentName: 'Your opponent', canUnready: false };
  private trayOrientation: Partial<Record<ShipId, Orientation>> = {};
  private active = false;

  constructor(
    private readonly board: BoardView,
    private readonly host: PlacementHost,
  ) {
    this.panel = el('section', 'ws-placement');
    this.panel.setAttribute('aria-labelledby', 'ws-placement-title');
    const title = el('h2', 'ws-panel-title', 'Deploy your fleet');
    title.id = 'ws-placement-title';
    this.hint = el('p', 'ws-placement-hint', 'Drag each ship onto your waters. Tap a ship or press R to rotate.');
    this.tray = el('ul', 'ws-tray');
    this.tray.setAttribute('aria-label', 'Ships to place');
    for (const ship of FLEET) {
      const li = el('li', 'ws-tray-slot');
      const button = el('button', 'ws-tray-ship');
      button.type = 'button';
      button.dataset.ship = ship.id;
      button.style.setProperty('--ws-len', String(ship.length));
      button.append(hullSvg(ship.id, 'horizontal'), el('span', 'ws-tray-label', `${ship.name} · ${ship.length}`));
      li.append(button);
      this.tray.append(li);
      this.trayItems.set(ship.id, button);
    }

    this.rotateButton = this.button('Rotate', 'ws-btn', () => this.rotateSelected());
    this.rotateButton.setAttribute('aria-keyshortcuts', 'R');
    this.randomButton = this.button('Randomize', 'ws-btn', () => this.randomize());
    this.clearButton = this.button('Clear', 'ws-btn ws-btn-quiet', () => this.clear());
    this.reuseButton = this.button('Reuse last fleet', 'ws-btn ws-btn-quiet', () => this.reuse());
    this.readyButton = this.button('Ready', 'ws-btn ws-btn-primary', () => this.submit());
    this.editButton = this.button('Edit fleet', 'ws-btn', () => this.host.unready());
    this.opponentChip = el('p', 'ws-ready-chip');
    this.opponentChip.setAttribute('role', 'status');

    const tools = el('div', 'ws-placement-tools');
    tools.append(this.rotateButton, this.randomButton, this.clearButton, this.reuseButton);
    const actions = el('div', 'ws-placement-actions');
    actions.append(this.readyButton, this.editButton);
    this.panel.append(title, this.hint, this.tray, tools, actions, this.opponentChip);

    this.tray.addEventListener('pointerdown', (event) => this.onTrayPointerDown(event));
    // Taps arm a tray ship (pointerup without movement); Enter and Space are handled on keydown.
    this.tray.addEventListener('keydown', (event) => this.onShipKey(event));
    board.shipsLayer.addEventListener('pointerdown', (event) => this.onShipPointerDown(event));
    board.shipsLayer.addEventListener('keydown', (event) => this.onShipKey(event));
    board.shipsLayer.addEventListener('contextmenu', (event) => {
      const ship = (event.target as HTMLElement).closest<HTMLElement>('.ws-ship');
      if (ship && this.editable) {
        event.preventDefault();
        this.rotateShip(ship.dataset.ship as ShipId);
      }
    });
    board.onCellClick = (coord) => {
      if (!this.editable || !this.armed) {
        return;
      }
      const shipId = this.armed;
      const placement: ShipPlacement = { shipId, row: coord.row, col: coord.col, orientation: this.trayOrientation[shipId] ?? 'horizontal' };
      if (fits(this.host.draft(), placement).ok) {
        this.armed = null;
        this.commit(place(this.host.draft(), placement), shipId);
        this.host.announce(`${describePlacement(placement)}`);
      } else {
        shake(this.board.frame, this.host.reducedMotion());
        this.host.announce(`${SHIP_NAME[shipId]} does not fit there.`);
      }
    };
    window.addEventListener('keydown', (event) => {
      if (!this.active || event.defaultPrevented) {
        return;
      }
      if ((event.key === 'r' || event.key === 'R') && this.carry?.mode === 'pointer') {
        event.preventDefault();
        this.rotateCarry();
      } else if ((event.key === 'r' || event.key === 'R') && !this.carry && !isTyping(event.target)) {
        event.preventDefault();
        this.rotateSelected();
      } else if (event.key === 'Escape' && this.carry?.mode === 'pointer') {
        this.cancelCarry();
      }
    });
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  private get editable(): boolean {
    return this.active && !this.state.ready;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.board.root.dataset.placing = active ? 'true' : 'false';
    if (!active) {
      this.cancelCarry();
      this.armed = null;
    }
  }

  update(state: PlacementState): void {
    this.state = state;
    this.render();
  }

  /** Redraws tray, ships, and buttons from the draft (or the locked fleet once ready). */
  render(): void {
    const draft = this.host.draft();
    const carry = this.carry;
    const ships: ShipRender[] = placedShips(draft)
      .filter((placement) => !(carry && carry.shipId === placement.shipId))
      .map((placement) => ({
        placement,
        state: this.state.ready ? 'afloat' : 'draft',
        interactive: this.editable,
      }));
    if (carry?.candidate) {
      if (carry.mode === 'keyboard') {
        ships.push({ placement: carry.candidate, state: 'carrying', interactive: true, invalid: !fits(draft, carry.candidate).ok });
      } else if (carry.origin) {
        ships.push({ placement: carry.origin, state: 'lifted', interactive: true });
      }
    } else if (carry?.origin) {
      ships.push({ placement: carry.origin, state: 'lifted', interactive: true });
    }
    this.board.renderShips(ships);
    for (const ship of ships) {
      const node = this.board.shipElement(ship.placement.shipId);
      if (node && ship.interactive) {
        node.setAttribute(
          'aria-label',
          ship.state === 'carrying'
            ? `${SHIP_NAME[ship.placement.shipId]}, carrying. ${describePlacement(ship.placement)}`
            : `${describePlacement(ship.placement)} Enter to move, R to rotate.`,
        );
        node.dataset.selected = this.selected === ship.placement.shipId ? 'true' : 'false';
      }
    }

    for (const [shipId, item] of this.trayItems) {
      const placed = draft[shipId] !== null;
      item.disabled = placed || !this.editable;
      item.dataset.placed = placed ? 'true' : 'false';
      item.dataset.armed = this.armed === shipId ? 'true' : 'false';
      item.setAttribute(
        'aria-label',
        placed ? `${SHIP_NAME[shipId]}, placed` : `${SHIP_NAME[shipId]}, ${SHIP_LENGTH[shipId]} cells. Enter to pick up.`,
      );
    }

    const complete = completeFleet(draft) !== null;
    this.tray.hidden = this.state.ready;
    this.hint.textContent = this.state.ready
      ? 'Fleet locked in. Your ships are hidden from your opponent.'
      : placedCount(draft) === FLEET.length
        ? 'All ships placed. Press Ready when you are happy with your deployment.'
        : 'Drag each ship onto your waters. Tap a ship or press R to rotate.';
    this.rotateButton.hidden = this.state.ready;
    this.randomButton.hidden = this.state.ready;
    this.clearButton.hidden = this.state.ready;
    this.rotateButton.disabled = !this.editable || !this.selected || draft[this.selected] === null;
    this.randomButton.disabled = !this.editable;
    this.clearButton.disabled = !this.editable || placedCount(draft) === 0;
    const last = this.host.lastFleet();
    this.reuseButton.hidden = this.state.ready || !last;
    this.reuseButton.disabled = !this.editable;
    this.readyButton.hidden = this.state.ready;
    this.readyButton.disabled = !this.editable || !complete;
    this.editButton.hidden = !this.state.ready || !this.state.canUnready;
    this.opponentChip.dataset.ready = this.state.opponentReady ? 'true' : 'false';
    this.opponentChip.textContent = this.state.opponentReady
      ? `${this.state.opponentName} is ready`
      : `${this.state.opponentName} is deploying…`;
  }

  // --- intents -----------------------------------------------------------------------------

  private commit(draft: Draft, focusShip?: ShipId): void {
    this.host.setDraft(draft);
    this.render();
    if (focusShip) {
      this.selected = focusShip;
      this.render();
    }
  }

  private arm(shipId: ShipId): void {
    if (!this.editable) {
      return;
    }
    this.armed = this.armed === shipId ? null : shipId;
    this.render();
    if (this.armed) {
      this.host.announce(`${SHIP_NAME[shipId]} selected. Tap a cell on your board to place its bow.`);
    }
  }

  private rotateSelected(): void {
    if (this.selected) {
      this.rotateShip(this.selected);
    } else if (this.armed) {
      const next = this.trayOrientation[this.armed] === 'vertical' ? 'horizontal' : 'vertical';
      this.trayOrientation[this.armed] = next;
      this.host.announce(`${SHIP_NAME[this.armed]} will be placed ${next}.`);
    }
  }

  private rotateShip(shipId: ShipId): void {
    const draft = this.host.draft();
    const current = draft[shipId];
    if (!this.editable || !current) {
      return;
    }
    const next = rotated(current);
    const node = this.board.shipElement(shipId);
    if (!fits(draft, next).ok) {
      shake(node, this.host.reducedMotion());
      this.host.announce(`${SHIP_NAME[shipId]} cannot rotate there.`);
      return;
    }
    this.selected = shipId;
    this.commit(place(draft, next));
    const after = this.board.shipElement(shipId);
    if (after && !this.host.reducedMotion() && typeof after.animate === 'function') {
      const length = SHIP_LENGTH[shipId];
      const origin = next.orientation === 'vertical' ? `50% ${50 / length}%` : `${50 / length}% 50%`;
      after.style.transformOrigin = origin;
      after.animate([{ transform: `rotate(${next.orientation === 'vertical' ? -90 : 90}deg)` }, { transform: 'rotate(0deg)' }], {
        duration: 150,
        easing: EASE_OUT,
      });
    }
    this.host.announce(describePlacement(next));
  }

  private randomize(): void {
    if (!this.editable) {
      return;
    }
    this.flip(randomDraft(mathRandom));
    this.host.announce('Fleet placed at random.');
  }

  private reuse(): void {
    const last = this.host.lastFleet();
    if (!this.editable || !last) {
      return;
    }
    this.flip(draftFromFleet(last));
    this.host.announce('Last fleet restored.');
  }

  private clear(): void {
    if (!this.editable) {
      return;
    }
    this.selected = null;
    this.commit(EMPTY_DRAFT);
    this.host.announce('Ships returned to the tray.');
  }

  /** FLIP: every ship glides from where it was (or the tray) to its new spot, 40 ms apart. */
  private flip(next: Draft): void {
    const before = new Map<ShipId, DOMRect>();
    for (const ship of FLEET) {
      const node = this.board.shipElement(ship.id) ?? this.trayItems.get(ship.id);
      if (node) {
        before.set(ship.id, node.getBoundingClientRect());
      }
    }
    this.selected = null;
    this.commit(next);
    if (this.host.reducedMotion()) {
      return;
    }
    FLEET.forEach((ship, index) => {
      const node = this.board.shipElement(ship.id);
      const from = before.get(ship.id);
      if (!node || !from || typeof node.animate !== 'function') {
        return;
      }
      const to = node.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return;
      }
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 320,
        delay: index * 40,
        easing: EASE_OUT,
        fill: 'backwards',
      });
    });
  }

  private submit(): void {
    const fleet = completeFleet(this.host.draft());
    if (!this.editable || !fleet) {
      return;
    }
    this.selected = null;
    this.host.ready(fleet);
    this.board.root.classList.remove('ws-anchoring');
    void this.board.root.offsetWidth;
    this.board.root.classList.add('ws-anchoring');
    setTimeout(() => this.board.root.classList.remove('ws-anchoring'), 900);
  }

  // --- pointer drag ------------------------------------------------------------------------

  private onTrayPointerDown(event: PointerEvent): void {
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>('.ws-tray-ship');
    if (!item || item.disabled || !this.editable || event.button > 0) {
      return;
    }
    const shipId = item.dataset.ship as ShipId;
    const rect = item.querySelector('.ws-hull')?.getBoundingClientRect() ?? item.getBoundingClientRect();
    const orientation = this.trayOrientation[shipId] ?? 'horizontal';
    const length = SHIP_LENGTH[shipId];
    // Grabbed by the label or padding rather than the hull: carry it by the middle.
    const onHull = rect.width > 0 && event.clientX >= rect.left && event.clientX <= rect.right;
    const along = onHull ? ((event.clientX - rect.left) / rect.width) * length : length / 2;
    this.begin(event, { shipId, origin: null, orientation, along });
  }

  private onShipPointerDown(event: PointerEvent): void {
    const node = (event.target as HTMLElement).closest<HTMLElement>('.ws-ship');
    if (!node || !this.editable || event.button > 0) {
      return;
    }
    const shipId = node.dataset.ship as ShipId;
    const origin = this.host.draft()[shipId];
    if (!origin) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const cell = this.cellSize();
    const along = origin.orientation === 'horizontal' ? (event.clientX - rect.left) / cell : (event.clientY - rect.top) / cell;
    this.selected = shipId;
    this.begin(event, { shipId, origin, orientation: origin.orientation, along });
  }

  private cellSize(): number {
    return this.board.originRect().width || 32;
  }

  private begin(event: PointerEvent, from: { shipId: ShipId; origin: ShipPlacement | null; orientation: Orientation; along: number }): void {
    this.cancelCarry();
    event.preventDefault();
    const target = event.target as Element;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer.
    }
    const grab = grabOffset({ shipId: from.shipId, orientation: from.orientation }, from.along);
    this.carry = {
      shipId: from.shipId,
      origin: from.origin,
      candidate: null,
      orientation: from.orientation,
      mode: 'pointer',
      grab,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === this.carry?.pointerId) {
        this.pointerMove(e);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.carry?.pointerId) {
        return;
      }
      cleanup();
      this.pointerUp(e);
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === this.carry?.pointerId) {
        cleanup();
        this.cancelCarry();
      }
    };
    const cleanup = () => {
      target.removeEventListener('pointermove', move as EventListener);
      target.removeEventListener('pointerup', up as EventListener);
      target.removeEventListener('pointercancel', cancel as EventListener);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move as EventListener);
    target.addEventListener('pointerup', up as EventListener);
    target.addEventListener('pointercancel', cancel as EventListener);
    // Without capture (some browsers on SVG children), fall back to window events.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private ensureGhost(carry: Carry): HTMLElement {
    if (carry.ghost) {
      return carry.ghost;
    }
    const cell = this.cellSize();
    const length = SHIP_LENGTH[carry.shipId];
    const ghost = el('div', 'ws-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${(carry.orientation === 'horizontal' ? length : 1) * cell}px`;
    ghost.style.height = `${(carry.orientation === 'horizontal' ? 1 : length) * cell}px`;
    ghost.append(hullSvg(carry.shipId, carry.orientation));
    (this.board.root.closest('.ws-app') ?? document.body).append(ghost);
    carry.ghost = ghost;
    carry.ghostGrab = { x: carry.grab.col * cell, y: carry.grab.row * cell };
    this.render();
    return ghost;
  }

  private positionGhost(carry: Carry, x: number, y: number): void {
    const ghost = this.ensureGhost(carry);
    const grab = carry.ghostGrab!;
    ghost.style.transform = `translate(${x - grab.x}px, ${y - grab.y}px) scale(1.04)`;
  }

  private pointerMove(event: PointerEvent): void {
    const carry = this.carry;
    if (!carry) {
      return;
    }
    if (!carry.moved && Math.hypot(event.clientX - carry.startX, event.clientY - carry.startY) < TAP_SLOP_PX) {
      return;
    }
    carry.moved = true;
    this.positionGhost(carry, event.clientX, event.clientY);
    this.updateCandidate(carry, event.clientX, event.clientY);
  }

  private updateCandidate(carry: Carry, x: number, y: number): void {
    const origin = this.board.originRect();
    const cell = origin.width || 32;
    const bow = snapBow(x - origin.left, y - origin.top, cell, carry.grab);
    const candidate: ShipPlacement = { shipId: carry.shipId, row: bow.row, col: bow.col, orientation: carry.orientation };
    const cells = shipCells(candidate);
    const onBoard = cells.some((c) => c.row >= 0 && c.row < 10 && c.col >= 0 && c.col < 10);
    carry.candidate = onBoard ? candidate : null;
    if (!onBoard) {
      this.board.clearPreview();
      return;
    }
    const ok = fits(this.host.draft(), candidate).ok;
    this.board.preview(
      cells.filter((c) => c.row >= 0 && c.row < 10 && c.col >= 0 && c.col < 10),
      ok,
    );
  }

  private pointerUp(event: PointerEvent): void {
    const carry = this.carry;
    if (!carry) {
      return;
    }
    if (!carry.moved) {
      this.carry = null;
      this.render();
      if (carry.origin) {
        this.rotateShip(carry.shipId);
      } else {
        this.arm(carry.shipId);
      }
      return;
    }
    this.updateCandidate(carry, event.clientX, event.clientY);
    this.board.clearPreview();
    const draft = this.host.draft();
    const candidate = carry.candidate;
    const reduced = this.host.reducedMotion();
    if (candidate && fits(draft, candidate).ok) {
      carry.ghost?.remove();
      this.carry = null;
      this.selected = carry.shipId;
      this.commit(place(draft, candidate));
      const node = this.board.shipElement(carry.shipId);
      if (node && !reduced && typeof node.animate === 'function') {
        node.animate(
          [{ transform: 'scale(1.04)' }, { transform: 'scale(0.98)', offset: 0.6 }, { transform: 'translateY(-1px) scale(1)', offset: 0.8 }, { transform: 'none' }],
          { duration: 260, easing: EASE_OUT },
        );
      }
      this.host.announce(describePlacement(candidate));
      return;
    }
    // Invalid drop: shake, then fly back to where it came from.
    const ghost = carry.ghost;
    this.carry = null;
    const home = carry.origin ? this.board.shipElement(carry.shipId) : this.trayItems.get(carry.shipId);
    this.render();
    this.host.announce(candidate ? `${SHIP_NAME[carry.shipId]} does not fit there.` : `${SHIP_NAME[carry.shipId]} returned.`);
    if (!ghost) {
      return;
    }
    if (reduced || typeof ghost.animate !== 'function') {
      ghost.remove();
      return;
    }
    const current = ghost.style.transform;
    const homeRect = home?.getBoundingClientRect();
    const back = homeRect ? `translate(${homeRect.left}px, ${homeRect.top}px) scale(1)` : current;
    const shakeAnim = ghost.animate(
      [
        { transform: `${current} translateX(0)` },
        { transform: `${current} translateX(-6px)` },
        { transform: `${current} translateX(6px)` },
        { transform: `${current} translateX(0)` },
      ],
      { duration: 200 },
    );
    shakeAnim.onfinish = () => {
      const fly = ghost.animate([{ transform: current, opacity: 1 }, { transform: back, opacity: 0.2 }], { duration: 180, easing: EASE_OUT, fill: 'forwards' });
      fly.onfinish = () => ghost.remove();
    };
  }

  private rotateCarry(): void {
    const carry = this.carry;
    if (!carry) {
      return;
    }
    carry.orientation = carry.orientation === 'horizontal' ? 'vertical' : 'horizontal';
    carry.grab = { row: carry.grab.col, col: carry.grab.row };
    if (carry.mode === 'pointer' && carry.ghost) {
      const rect = carry.ghost.getBoundingClientRect();
      const x = rect.left + (carry.ghostGrab?.x ?? 0);
      const y = rect.top + (carry.ghostGrab?.y ?? 0);
      carry.ghost.remove();
      delete carry.ghost;
      this.positionGhost(carry, x, y);
      this.updateCandidate(carry, x, y);
    } else if (carry.candidate) {
      carry.candidate = clampToBoard({ ...carry.candidate, orientation: carry.orientation });
      this.render();
      this.host.announce(this.carryLine(carry.candidate));
    }
  }

  private cancelCarry(): void {
    const carry = this.carry;
    if (!carry) {
      return;
    }
    carry.ghost?.remove();
    this.carry = null;
    this.board.clearPreview();
    this.render();
    if (carry.mode === 'keyboard') {
      this.focusShip(carry.shipId);
      this.host.announce(`${SHIP_NAME[carry.shipId]} put back.`);
    }
  }

  // --- keyboard ----------------------------------------------------------------------------

  private carryLine(candidate: ShipPlacement): string {
    return fits(this.host.draft(), candidate).ok ? describePlacement(candidate) : `${describePlacement(candidate)} Blocked.`;
  }

  private focusShip(shipId: ShipId): void {
    const node = this.board.shipElement(shipId);
    if (node instanceof HTMLButtonElement) {
      node.focus();
    } else {
      this.trayItems.get(shipId)?.focus();
    }
  }

  private onShipKey(event: KeyboardEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.ws-ship, .ws-tray-ship');
    if (!target || !this.editable) {
      return;
    }
    const shipId = target.dataset.ship as ShipId;
    const carry = this.carry;
    if (carry?.mode === 'keyboard' && carry.shipId === shipId) {
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const step = moves[event.key];
      if (step && carry.candidate) {
        event.preventDefault();
        carry.candidate = clampToBoard(moved(carry.candidate, step[0], step[1]));
        this.render();
        this.focusShip(shipId);
        this.host.announce(this.carryLine(carry.candidate));
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this.rotateCarry();
        this.focusShip(shipId);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const candidate = carry.candidate!;
        if (fits(this.host.draft(), candidate).ok) {
          this.carry = null;
          this.selected = shipId;
          this.commit(place(this.host.draft(), candidate));
          this.focusShip(shipId);
          this.host.announce(`Placed. ${describePlacement(candidate)}`);
        } else {
          shake(this.board.shipElement(shipId), this.host.reducedMotion());
          this.host.announce(`${SHIP_NAME[shipId]} does not fit there.`);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelCarry();
      } else if (event.key === 'Tab') {
        this.cancelCarry();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.pickUp(shipId);
    } else if ((event.key === 'r' || event.key === 'R') && this.host.draft()[shipId]) {
      event.preventDefault();
      this.rotateShip(shipId);
      this.focusShip(shipId);
    }
  }

  private pickUp(shipId: ShipId): void {
    const draft = this.host.draft();
    const origin = draft[shipId];
    const orientation = origin?.orientation ?? this.trayOrientation[shipId] ?? 'horizontal';
    let start = origin ?? clampToBoard({ shipId, row: 0, col: 0, orientation });
    if (!origin) {
      // From the tray: start at the first open spot, scanning from A1.
      outer: for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          const candidate = { shipId, row, col, orientation };
          if (fits(draft, candidate).ok) {
            start = candidate;
            break outer;
          }
        }
      }
    }
    this.cancelCarry();
    this.carry = {
      shipId,
      origin,
      candidate: start,
      orientation,
      mode: 'keyboard',
      grab: { row: 0, col: 0 },
      startX: 0,
      startY: 0,
      moved: true,
    };
    this.selected = shipId;
    this.render();
    this.focusShip(shipId);
    this.host.announce(
      `${SHIP_NAME[shipId]} picked up. ${this.carryLine(start)} Arrow keys move, R rotates, Enter drops, Escape cancels.`,
    );
  }

  /** Test hook: replace the draft outright. */
  setDraft(fleet: Fleet): void {
    this.cancelCarry();
    this.selected = null;
    this.commit(draftFromFleet(fleet));
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
