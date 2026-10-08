import type { EventMessage, TableSnapshot } from '../../protocol.js';
import { BOARD_COLS, BOARD_ROWS, CASE_FILE, cellKind, ROOM_LAYOUT, START_CELLS, startPositions, type Reach } from '../../rules/board.js';
import { ROOM_IDS, ROOM_NAME, SUSPECT_COLOR, SUSPECT_IDS, SUSPECT_NAME, WEAPON_IDS, WEAPON_NAME } from '../../rules/constants.js';
import type { RoomId, SeatId, SuspectId, TokenPosition, WeaponId } from '../../rules/types.js';
import { caseFileMarkup, portraitMarkup, roomMarkup, weaponMarkup } from '../art/index.js';
import { EASE_IN_OUT, EASE_OUT, FxClock, svg } from '../fx/animate.js';
import { cameraKeyframes, cameraPlan, FULL_VIEW } from '../fx/camera.js';
import { phase, stepTimes, type EventSchedule } from '../fx/timeline.js';
import {
  caseFileCenter,
  cellCenterUnits,
  doorSegment,
  passageCorner,
  rectUnits,
  suspectSlot,
  TOKEN_RADIUS,
  tokenPoint,
  UNIT,
  WEAPON_SIZE,
  weaponSlot,
  type Point,
} from '../geometry.js';
import { destinationKey, destinationLabel } from '../narrate.js';
import type { ViewModel } from '../view-model.js';
import { h } from './dom.js';

export interface BoardIntents {
  move(to: TokenPosition): void;
}

function translate(point: Point): string {
  return `translate(${round(point.x)}px, ${round(point.y)}px)`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function nested(markup: string, viewBox: string, attrs: Record<string, string | number>): SVGSVGElement {
  const node = svg('svg', { viewBox, preserveAspectRatio: 'xMidYMid slice', ...attrs });
  node.innerHTML = markup;
  return node;
}

/**
 * The play surface: Starfall Manor top-down, 10 SVG units to a square. Rooms come from the art
 * module; hallway tiles, walls, doors, passages, and the case file are drawn here. Suspect tokens
 * are portrait discs with their colour rim, weapon tokens sit in their rooms. Every layer lives in
 * one camera group, which zooms onto the action and eases back.
 */
export class BoardView {
  readonly root: HTMLElement;
  readonly svgEl: SVGSVGElement;
  /** The group the camera transforms. */
  readonly camera: SVGGElement;
  private readonly destLayer: SVGGElement;
  private readonly previewLayer: SVGGElement;
  private readonly fxLayer: SVGGElement;
  private readonly caseGlow: SVGRectElement;
  private readonly stamp: SVGGElement;
  private readonly stampText: SVGTextElement;
  private readonly spotlight: SVGRectElement;
  private readonly tokens = new Map<SuspectId, { node: SVGGElement; body: SVGGElement; ring: SVGCircleElement }>();
  private readonly weapons = new Map<WeaponId, SVGGElement>();
  private destKey = '';
  private reaches: Reach[] = [];
  private clock: FxClock | null = null;

  constructor(private readonly intents: BoardIntents) {
    this.svgEl = svg('svg', {
      class: 'wd-board',
      viewBox: `${FULL_VIEW.x} ${FULL_VIEW.y} ${FULL_VIEW.w} ${FULL_VIEW.h}`,
      role: 'group',
      'aria-label': 'Starfall Manor',
      'data-testid': 'board',
    });
    const defs = svg('defs');
    defs.innerHTML = `
      <clipPath id="wd-token-clip"><circle cx="0" cy="0" r="${TOKEN_RADIUS - 0.6}"/></clipPath>
      <radialGradient id="wd-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ff4fa3" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#ff4fa3" stop-opacity="0"/>
      </radialGradient>
      <pattern id="wd-hall-tile" width="${UNIT}" height="${UNIT}" patternUnits="userSpaceOnUse">
        <rect width="${UNIT}" height="${UNIT}" fill="#2b1b3f"/>
        <path d="M0 0H${UNIT}V${UNIT}" fill="none" stroke="#3d2858" stroke-width="0.5"/>
        <circle cx="${UNIT / 2}" cy="${UNIT / 2}" r="0.5" fill="#4a3266"/>
      </pattern>`;
    this.camera = svg('g', { class: 'wd-camera' });
    this.destLayer = svg('g', { class: 'wd-dests' });
    this.previewLayer = svg('g', { class: 'wd-path-preview', 'aria-hidden': 'true' });
    this.fxLayer = svg('g', { class: 'wd-board-fx', 'aria-hidden': 'true' });

    const caseRect = rectUnits(CASE_FILE);
    this.caseGlow = svg('rect', { class: 'wd-case-glow', x: caseRect.x - 6, y: caseRect.y - 6, width: caseRect.w + 12, height: caseRect.h + 12, rx: 8 });
    this.stampText = svg('text', { class: 'wd-stamp-text', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    this.stamp = svg('g', { class: 'wd-stamp', transform: `translate(${caseFileCenter().x} ${caseFileCenter().y}) rotate(-12)` }, this.stampText);
    this.spotlight = svg('rect', { class: 'wd-spotlight', rx: 4 });
    this.fxLayer.append(this.spotlight, this.caseGlow, this.stamp);

    this.camera.append(
      this.drawFloor(),
      this.drawRooms(),
      this.drawCaseFile(),
      this.drawDoors(),
      this.drawPassages(),
      this.drawStarts(),
      this.fxLayer,
      this.destLayer,
      this.previewLayer,
      this.drawWeapons(),
      this.drawTokens(),
    );
    this.svgEl.append(defs, this.camera);
    this.root = h('div', { class: 'wd-board-wrap' }, this.svgEl);
  }

  private drawFloor(): SVGGElement {
    const layer = svg('g', { class: 'wd-floor' });
    layer.append(svg('rect', { class: 'wd-floor-base', x: -4, y: -4, width: BOARD_COLS * UNIT + 8, height: BOARD_ROWS * UNIT + 8, rx: 6 }));
    for (let y = 0; y < BOARD_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        if (cellKind(x, y) === 'hall') {
          layer.append(svg('rect', { class: 'wd-tile', x: x * UNIT + 0.3, y: y * UNIT + 0.3, width: UNIT - 0.6, height: UNIT - 0.6, rx: 1.2 }));
        }
      }
    }
    return layer;
  }

  private drawRooms(): SVGGElement {
    const layer = svg('g', { class: 'wd-rooms' });
    for (const room of ROOM_IDS) {
      const { rect } = ROOM_LAYOUT[room];
      const r = rectUnits(rect);
      const plaqueWidth = Math.min(r.w - 6, ROOM_NAME[room].length * 3.4 + 8);
      const group = svg(
        'g',
        { class: 'wd-room', 'data-room': room },
        nested(roomMarkup(room, rect.w, rect.h), `0 0 ${r.w} ${r.h}`, { x: r.x, y: r.y, width: r.w, height: r.h, class: 'wd-room-art' }),
        svg('rect', { class: 'wd-wall', x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.5 }),
        svg('rect', { class: 'wd-plaque', x: r.x + r.w / 2 - plaqueWidth / 2, y: r.y + 2.5, width: plaqueWidth, height: 7, rx: 3.5 }),
      );
      const label = svg('text', { class: 'wd-room-name', x: r.x + r.w / 2, y: r.y + 6.2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
      label.textContent = ROOM_NAME[room];
      group.append(label);
      layer.append(group);
    }
    return layer;
  }

  private drawCaseFile(): SVGGElement {
    const r = rectUnits(CASE_FILE);
    const label = svg('text', { class: 'wd-case-label', x: r.x + r.w / 2, y: r.y + r.h - 4, 'text-anchor': 'middle' });
    label.textContent = 'Case file';
    return svg(
      'g',
      { class: 'wd-case-file', 'data-testid': 'case-file' },
      nested(caseFileMarkup(CASE_FILE.w, CASE_FILE.h), `0 0 ${r.w} ${r.h}`, { x: r.x, y: r.y, width: r.w, height: r.h }),
      svg('rect', { class: 'wd-case-frame', x: r.x, y: r.y, width: r.w, height: r.h, rx: 3 }),
      label,
    );
  }

  private drawDoors(): SVGGElement {
    const layer = svg('g', { class: 'wd-doors' });
    for (const room of ROOM_IDS) {
      for (const door of ROOM_LAYOUT[room].doors) {
        const seg = doorSegment(room, door);
        layer.append(svg('line', { class: 'wd-door', 'data-side': seg.side, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 }));
      }
    }
    return layer;
  }

  private drawPassages(): SVGGElement {
    const layer = svg('g', { class: 'wd-passages' });
    for (const room of ROOM_IDS) {
      const corner = passageCorner(room);
      const target = ROOM_LAYOUT[room].passage;
      if (!corner || !target) {
        continue;
      }
      const glyph = svg(
        'g',
        { class: 'wd-passage', 'data-passage': room, transform: `translate(${corner.x} ${corner.y})` },
        svg('circle', { r: 4.2 }),
        svg('path', { d: 'M-2 -1.6 L1.8 0 L-2 1.6 M0.2 -2.6 L2.8 0 L0.2 2.6', class: 'wd-passage-arrow' }),
      );
      const to = rectUnits(ROOM_LAYOUT[target].rect);
      const angle = (Math.atan2(to.y + to.h / 2 - corner.y, to.x + to.w / 2 - corner.x) * 180) / Math.PI;
      glyph.lastElementChild?.setAttribute('transform', `rotate(${round(angle)})`);
      const title = svg('title');
      title.textContent = `Secret passage to the ${ROOM_NAME[target]}`;
      glyph.append(title);
      layer.append(glyph);
    }
    return layer;
  }

  private drawStarts(): SVGGElement {
    const layer = svg('g', { class: 'wd-starts' });
    for (const suspect of SUSPECT_IDS) {
      const c = cellCenterUnits(START_CELLS[suspect]);
      layer.append(svg('circle', { class: 'wd-start', cx: c.x, cy: c.y, r: 3.4, stroke: SUSPECT_COLOR[suspect] }));
    }
    return layer;
  }

  private drawWeapons(): SVGGElement {
    const layer = svg('g', { class: 'wd-weapons' });
    const half = WEAPON_SIZE / 2;
    for (const weapon of WEAPON_IDS) {
      const title = svg('title');
      title.textContent = WEAPON_NAME[weapon];
      const node = svg(
        'g',
        { class: 'wd-weapon-token', 'data-weapon': weapon, 'data-testid': `weapon-${weapon}` },
        svg('circle', { class: 'wd-weapon-disc', r: half + 0.6 }),
        nested(weaponMarkup(weapon), '0 0 64 64', { x: -half + 0.8, y: -half + 0.8, width: WEAPON_SIZE - 1.6, height: WEAPON_SIZE - 1.6 }),
        title,
      );
      node.style.display = 'none';
      this.weapons.set(weapon, node);
      layer.append(node);
    }
    return layer;
  }

  private drawTokens(): SVGGElement {
    const layer = svg('g', { class: 'wd-tokens' });
    for (const suspect of SUSPECT_IDS) {
      const r = TOKEN_RADIUS;
      const ring = svg('circle', { class: 'wd-token-pulse', r: r + 1.8, stroke: SUSPECT_COLOR[suspect] });
      const portrait = nested(portraitMarkup(suspect), '0 0 100 100', { x: -r, y: -r, width: r * 2, height: r * 2 });
      const body = svg(
        'g',
        { class: 'wd-token-body' },
        svg('ellipse', { class: 'wd-token-shadow', cx: 0.6, cy: r * 0.9, rx: r * 0.9, ry: r * 0.35 }),
        svg('circle', { class: 'wd-token-base', r }),
        svg('g', { 'clip-path': 'url(#wd-token-clip)' }, portrait),
        svg('circle', { class: 'wd-token-rim', r: r - 0.3, stroke: SUSPECT_COLOR[suspect] }),
      );
      const title = svg('title');
      title.textContent = SUSPECT_NAME[suspect];
      const node = svg('g', { class: 'wd-token', 'data-suspect': suspect, 'data-testid': `token-${suspect}` }, ring, body, title);
      this.tokens.set(suspect, { node, body, ring });
      layer.append(node);
    }
    return layer;
  }

  /** Puts every token where the presented snapshot has it, and lights the squares you may move to. */
  update(snapshot: TableSnapshot | null, vm: ViewModel): void {
    const positions = snapshot?.positions ?? startPositions();
    const inPlay = new Set(snapshot?.seats.filter((seat) => seat.occupied && seat.suspect).map((seat) => seat.suspect!));
    const current = snapshot?.status === 'playing' ? snapshot.seats.find((seat) => seat.seatId === snapshot.currentSeatId)?.suspect : null;
    for (const suspect of SUSPECT_IDS) {
      const token = this.tokens.get(suspect)!;
      const position = positions[suspect];
      token.node.style.transform = translate(tokenPoint(position, suspect));
      token.node.dataset.active = inPlay.has(suspect) ? 'true' : 'false';
      token.node.dataset.mine = vm.mySuspect === suspect ? 'true' : 'false';
      token.node.dataset.turn = current === suspect ? 'true' : 'false';
      token.node.dataset.where = position.kind === 'room' ? position.room : 'hall';
    }
    for (const weapon of WEAPON_IDS) {
      const node = this.weapons.get(weapon)!;
      const room = snapshot?.weapons?.[weapon];
      node.style.display = room ? '' : 'none';
      if (room) {
        node.style.transform = translate(weaponSlot(room, weapon));
        node.dataset.room = room;
      }
    }
    this.svgEl.dataset.status = snapshot?.status ?? 'connecting';
    this.renderDestinations(vm.canMove ? vm.destinations : []);
  }

  private renderDestinations(reaches: Reach[]): void {
    const key = reaches.map(destinationKey).join('|');
    if (key === this.destKey) {
      return;
    }
    this.destKey = key;
    this.reaches = reaches;
    this.previewLayer.replaceChildren();
    const nodes = reaches.map((reach) => {
      const to = reach.destination;
      const attrs =
        to.kind === 'room'
          ? (() => {
              const r = rectUnits(ROOM_LAYOUT[to.room].rect);
              return { x: r.x + 1, y: r.y + 1, width: r.w - 2, height: r.h - 2, rx: 3, class: 'wd-dest wd-dest-room' };
            })()
          : { x: to.x * UNIT + 1, y: to.y * UNIT + 1, width: UNIT - 2, height: UNIT - 2, rx: 2, class: 'wd-dest wd-dest-hall' };
      const node = svg('rect', {
        ...attrs,
        'data-dest': destinationKey(reach),
        'data-testid': `dest-${destinationKey(reach).replace(':', '-').replace(',', '-')}`,
        role: 'button',
        tabindex: 0,
        'aria-label': `Move to ${destinationLabel(reach)}`,
      });
      const go = () => this.intents.move(reach.destination);
      node.addEventListener('click', go);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
      node.addEventListener('pointerenter', () => this.preview(reach));
      node.addEventListener('focus', () => this.preview(reach));
      node.addEventListener('pointerleave', () => this.preview(null));
      node.addEventListener('blur', () => this.preview(null));
      return node;
    });
    this.destLayer.replaceChildren(...nodes);
    this.svgEl.dataset.moving = reaches.length > 0 ? 'true' : 'false';
  }

  /** The route a destination would take, traced while you point at it. */
  preview(reach: Reach | null): void {
    this.previewLayer.replaceChildren();
    if (!reach) {
      return;
    }
    const suspect = this.mySuspect();
    const points = reach.path.map((position) => (suspect ? tokenPoint(position, suspect) : position.kind === 'hall' ? cellCenterUnits(position) : suspectSlot(position.room, 'vesper')));
    this.previewLayer.append(
      svg('polyline', { class: 'wd-path-line', points: points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ') }),
      ...points.slice(1, -1).map((p) => svg('circle', { class: 'wd-path-dot', cx: p.x, cy: p.y, r: 1.1 })),
    );
  }

  private mySuspect(): SuspectId | null {
    for (const [suspect, token] of this.tokens) {
      if (token.node.dataset.mine === 'true') {
        return suspect;
      }
    }
    return null;
  }

  /** The destination keys currently lit, for tests and the dev hook. */
  destinations(): string[] {
    return this.reaches.map(destinationKey);
  }

  stop(): void {
    this.clock?.cancel();
    this.clock = null;
  }

  /**
   * Starts an event's motion `elapsed` ms in, against the state before it: tokens walk the path
   * square by square, slip through passages, or are pulled into the room of a suggestion, and the
   * camera follows. The presenter folds the result in at its cue, which is where every animation
   * here ends, so nothing jumps.
   */
  playEvent(message: EventMessage, schedule: EventSchedule, elapsed: number, before: TableSnapshot | null): void {
    this.stop();
    const clock = new FxClock(elapsed);
    this.clock = clock;
    const event = message.event;
    const reduced = schedule.reduced;
    const suspectOf = (seatId: string): SuspectId | null =>
      before?.seats.find((seat) => seat.seatId === seatId)?.suspect ?? before?.recap?.roster[seatId as SeatId]?.suspect ?? null;

    const plan = cameraPlan(event, schedule, { positions: before?.positions ?? null, suspectOf });
    if (plan) {
      const { keyframes, duration } = cameraKeyframes(plan, reduced);
      clock.at(this.camera, keyframes, { start: 0, duration, fill: 'none' });
    }

    switch (event.kind) {
      case 'rolled':
      case 'turn_passed': {
        const suspect = suspectOf(event.kind === 'rolled' ? event.seatId : event.nextSeatId);
        const token = suspect ? this.tokens.get(suspect) : undefined;
        if (token && !reduced) {
          clock.at(token.ring, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1.6)' }], {
            start: 0,
            duration: Math.min(schedule.total, 900),
            easing: EASE_OUT,
            fill: 'none',
            iterations: event.kind === 'rolled' ? 2 : 1,
          });
        }
        break;
      }
      case 'moved': {
        const token = this.tokens.get(event.suspect);
        if (!token || reduced || event.path.length < 2) {
          break;
        }
        const points = event.path.map((position) => tokenPoint(position, event.suspect));
        if (event.via === 'passage') {
          const cut = phase(schedule, 'vanish')?.end ?? schedule.resolveAt;
          const at = cut / schedule.total;
          const from = translate(points[0]!);
          const to = translate(points.at(-1)!);
          clock.at(
            token.node,
            [
              { transform: from, opacity: 1, offset: 0 },
              { transform: from, opacity: 0, offset: at },
              { transform: to, opacity: 0, offset: Math.min(1, at + 0.001) },
              { transform: to, opacity: 1, offset: 1 },
            ],
            { start: 0, duration: schedule.total, easing: EASE_IN_OUT },
          );
          clock.at(token.body, [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(0.2) rotate(240deg)', offset: at }, { transform: 'scale(1) rotate(360deg)' }], {
            start: 0,
            duration: schedule.total,
            easing: EASE_IN_OUT,
            fill: 'none',
          });
          break;
        }
        const walk = phase(schedule, 'walk');
        if (!walk || walk.end <= walk.start) {
          break;
        }
        const steps = points.length - 1;
        const times = stepTimes(schedule, steps);
        const span = walk.end - walk.start;
        clock.at(
          token.node,
          [
            { transform: translate(points[0]!), offset: 0 },
            ...points.slice(1).map((point, i) => ({ transform: translate(point), offset: Math.min(1, (times[i]! - walk.start) / span) })),
          ],
          { start: walk.start, duration: span },
        );
        clock.at(token.body, [{ transform: 'translateY(0)' }, { transform: 'translateY(-2.4px)', offset: 0.45 }, { transform: 'translateY(0)' }], {
          start: walk.start,
          duration: span / steps,
          iterations: steps,
          easing: 'ease-in-out',
          fill: 'none',
        });
        break;
      }
      case 'suggested': {
        this.spot(clock, event.room, schedule);
        if (reduced) {
          break;
        }
        const pull = phase(schedule, 'pull');
        const start = pull?.start ?? 0;
        const duration = (pull?.end ?? schedule.resolveAt) - start;
        const token = this.tokens.get(event.suspect);
        const from = tokenPoint(event.suspectFrom, event.suspect);
        const to = suspectSlot(event.room, event.suspect);
        if (token && (from.x !== to.x || from.y !== to.y)) {
          clock.at(token.node, [{ transform: translate(from) }, { transform: translate(to) }], { start, duration, easing: EASE_IN_OUT });
        }
        const weapon = this.weapons.get(event.weapon);
        if (weapon && event.weaponFrom !== event.room) {
          weapon.style.display = '';
          clock.at(weapon, [{ transform: translate(weaponSlot(event.weaponFrom, event.weapon)) }, { transform: translate(weaponSlot(event.room, event.weapon)) }], {
            start,
            duration,
            easing: EASE_IN_OUT,
          });
        }
        break;
      }
      case 'accused':
      case 'game_over': {
        const verdictAt = event.kind === 'accused' ? (phase(schedule, 'verdict')?.start ?? schedule.resolveAt) : schedule.resolveAt;
        this.stampText.textContent = event.kind === 'accused' ? (event.correct ? 'Solved' : 'Wrong') : event.reason === 'solved' ? 'Closed' : 'Cold';
        this.stamp.dataset.tone = event.kind === 'accused' ? (event.correct ? 'win' : 'lose') : 'neutral';
        clock.at(this.caseGlow, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0.6, offset: 0.8 }, { opacity: 0 }], {
          start: 0,
          duration: schedule.total,
          fill: 'none',
        });
        clock.at(
          this.stamp,
          reduced
            ? [{ opacity: 1 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: `translate(${caseFileCenter().x}px, ${caseFileCenter().y}px) rotate(-12deg) scale(2.4)` },
                { opacity: 1, transform: `translate(${caseFileCenter().x}px, ${caseFileCenter().y}px) rotate(-12deg) scale(1)`, offset: 0.12 },
                { opacity: 1, transform: `translate(${caseFileCenter().x}px, ${caseFileCenter().y}px) rotate(-12deg) scale(1)`, offset: 0.85 },
                { opacity: 0, transform: `translate(${caseFileCenter().x}px, ${caseFileCenter().y}px) rotate(-12deg) scale(1)` },
              ],
          { start: verdictAt, duration: Math.max(1, schedule.total - verdictAt), easing: EASE_OUT, fill: 'none' },
        );
        break;
      }
      default:
        break;
    }
  }

  private spot(clock: FxClock, room: RoomId, schedule: EventSchedule): void {
    const r = rectUnits(ROOM_LAYOUT[room].rect);
    this.spotlight.setAttribute('x', String(r.x - 2));
    this.spotlight.setAttribute('y', String(r.y - 2));
    this.spotlight.setAttribute('width', String(r.w + 4));
    this.spotlight.setAttribute('height', String(r.h + 4));
    clock.at(this.spotlight, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], {
      start: 0,
      duration: schedule.total,
      fill: 'none',
    });
  }
}
