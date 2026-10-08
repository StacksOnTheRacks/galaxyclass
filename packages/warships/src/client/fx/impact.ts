import { SHIP_LENGTH } from '../../rules/constants.js';
import type { SunkShip } from '../../rules/types.js';
import { EASE_OUT, svg, type ShotClock } from './animate.js';
import { GUTTER, REDUCED_FADE_MS } from './timeline.js';

interface ImpactOptions {
  at: { x: number; y: number };
  start: number;
  /** The resolve phase length; every layer finishes inside it. */
  span: number;
  reduced: boolean;
  random: () => number;
}

/** Layer timings are authored for the base 450 ms resolve and scale with the real one. */
const BASE_RESOLVE_MS = 450;

const PARTICLES = 10;
const DROPLETS = 6;
const RIPPLES = 3;

/** A hit: white flash, an orange core burst, a shock ring, and sparks flying out. */
export function hitBurst(group: SVGGElement, clock: ShotClock, { at, start, span, reduced, random }: ImpactOptions): void {
  const flash = svg('rect', { x: at.x - 0.5, y: at.y - 0.5, width: 1, height: 1, class: 'ws-fx-flash', opacity: 0 });
  group.append(flash);
  if (reduced) {
    clock.at(flash, [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }], { start, duration: REDUCED_FADE_MS * 2 });
    return;
  }
  const k = span / BASE_RESOLVE_MS;
  clock.at(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { start, duration: 150 * k });

  const core = svg('circle', { cx: at.x, cy: at.y, r: 1, class: 'ws-fx-core', opacity: 0 });
  const shock = svg('circle', { cx: at.x, cy: at.y, r: 1, class: 'ws-fx-shock', opacity: 0 });
  group.append(core, shock);
  clock.at(
    core,
    [
      { transform: 'scale(0.2)', opacity: 1 },
      { transform: 'scale(1.1)', opacity: 0.9, offset: 0.45 },
      { transform: 'scale(1.4)', opacity: 0 },
    ],
    { start: start + 40 * k, duration: 410 * k, easing: EASE_OUT },
  );
  clock.at(
    shock,
    [
      { transform: 'scale(0.3)', opacity: 0.9 },
      { transform: 'scale(1.8)', opacity: 0 },
    ],
    { start: start + 60 * k, duration: 380 * k, easing: EASE_OUT },
  );

  for (let i = 0; i < PARTICLES; i++) {
    const angle = ((i + random() * 0.6) / PARTICLES) * Math.PI * 2;
    const distance = 0.9 + random() * 0.8;
    const spark = svg('circle', { cx: at.x, cy: at.y, r: 0.06 + random() * 0.05, class: 'ws-fx-spark', opacity: 0 });
    group.append(spark);
    clock.at(
      spark,
      [
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: `translate(${(Math.cos(angle) * distance).toFixed(3)}px, ${(Math.sin(angle) * distance).toFixed(3)}px)`, opacity: 0 },
      ],
      { start: start + 50 * k, duration: 400 * k, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
    );
  }
}

/** A miss: three ripple rings and droplets arcing out of the splash. */
export function missSplash(group: SVGGElement, clock: ShotClock, { at, start, span, reduced, random }: ImpactOptions): void {
  if (reduced) {
    const ring = svg('circle', { cx: at.x, cy: at.y, r: 0.42, class: 'ws-fx-ripple', opacity: 0 });
    group.append(ring);
    clock.at(ring, [{ opacity: 0 }, { opacity: 0.8 }, { opacity: 0 }], { start, duration: REDUCED_FADE_MS * 2 });
    return;
  }
  const k = span / BASE_RESOLVE_MS;
  for (let i = 0; i < RIPPLES; i++) {
    const ring = svg('circle', { cx: at.x, cy: at.y, r: 0.5, class: 'ws-fx-ripple', opacity: 0 });
    group.append(ring);
    clock.at(
      ring,
      [
        { transform: 'scale(0)', opacity: 0.95 },
        { transform: 'scale(1.8)', opacity: 0 },
      ],
      { start: start + i * 60 * k, duration: 330 * k, easing: EASE_OUT },
    );
  }
  for (let i = 0; i < DROPLETS; i++) {
    const angle = ((i + 0.5 + (random() - 0.5) * 0.5) / DROPLETS) * Math.PI * 2;
    const reach = 0.45 + random() * 0.4;
    const dx = Math.cos(angle) * reach;
    const dy = Math.sin(angle) * reach * 0.6;
    const lift = 0.35 + random() * 0.3;
    const drop = svg('circle', { cx: at.x, cy: at.y, r: 0.07, class: 'ws-fx-droplet', opacity: 0 });
    group.append(drop);
    clock.at(
      drop,
      [
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: `translate(${(dx / 2).toFixed(3)}px, ${(dy / 2 - lift).toFixed(3)}px)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx.toFixed(3)}px, ${(dy + 0.1).toFixed(3)}px)`, opacity: 0 },
      ],
      { start: start + 30 * k, duration: 400 * k },
    );
  }
}

/** Board-local outline of a ship's hull, as an SVG path in cell units. */
export function hullOutline(ship: Pick<SunkShip, 'row' | 'col' | 'orientation' | 'shipId'>, inset = 0.08): string {
  const length = SHIP_LENGTH[ship.shipId];
  const x = GUTTER + ship.col + inset;
  const y = GUTTER + ship.row + inset;
  const w = (ship.orientation === 'horizontal' ? length : 1) - inset * 2;
  const h = (ship.orientation === 'horizontal' ? 1 : length) - inset * 2;
  const r = 0.36;
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

/** The sunk ship's hull draws on over its cells, then glows until the banner clears. */
export function sinkOutline(
  group: SVGGElement,
  clock: ShotClock,
  { ship, start, end, reduced }: { ship: SunkShip; start: number; end: number; reduced: boolean },
): void {
  const outline = svg('path', { d: hullOutline(ship), class: 'ws-fx-sink', pathLength: 100, opacity: 0 });
  group.append(outline);
  const span = Math.max(1, end - start);
  if (reduced) {
    clock.at(outline, [{ opacity: 0 }, { opacity: 1, offset: Math.min(0.5, REDUCED_FADE_MS / span) }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], {
      start,
      duration: span,
    });
    outline.setAttribute('stroke-dasharray', 'none');
    return;
  }
  outline.setAttribute('stroke-dasharray', '100');
  clock.at(outline, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { start, duration: Math.min(600, span), easing: EASE_OUT });
  clock.at(outline, [{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { start, duration: span });
}
