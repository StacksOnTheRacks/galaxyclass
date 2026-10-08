import { SHIP_LENGTH } from '../../rules/constants.js';
import type { Orientation, ShipId } from '../../rules/types.js';
import { svg } from '../fx/animate.js';

/** Deck fittings per class, as fractions along the hull (bow = 0). */
const TURRETS: Record<ShipId, number[]> = {
  carrier: [],
  battleship: [0.28, 0.5, 0.78],
  cruiser: [0.3, 0.7],
  submarine: [0.45],
  destroyer: [0.35],
};

/**
 * A top-down hull, bow first, drawn in a 10-units-per-cell box so it scales with any cell size.
 * The bow is where the placement anchors: left when horizontal, top when vertical.
 */
export function hullSvg(shipId: ShipId, orientation: Orientation): SVGSVGElement {
  const length = SHIP_LENGTH[shipId] * 10;
  const p = (along: number, across: number) => (orientation === 'horizontal' ? `${along} ${across}` : `${across} ${along}`);
  const bowTip = shipId === 'submarine' ? 2.2 : 0.8;
  const d = [
    `M ${p(bowTip, 5)}`,
    `Q ${p(3, 1.4)} ${p(9, 1.6)}`,
    `L ${p(length - 2.4, 1.6)}`,
    `Q ${p(length - 0.8, 1.8)} ${p(length - 0.8, 4)}`,
    `L ${p(length - 0.8, 6)}`,
    `Q ${p(length - 0.8, 8.2)} ${p(length - 2.4, 8.4)}`,
    `L ${p(9, 8.4)}`,
    `Q ${p(3, 8.6)} ${p(bowTip, 5)}`,
    'Z',
  ].join(' ');
  const width = orientation === 'horizontal' ? length : 10;
  const height = orientation === 'horizontal' ? 10 : length;
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'ws-hull', 'aria-hidden': 'true', focusable: 'false' });
  root.append(svg('path', { d, class: 'ws-hull-body' }));
  if (shipId === 'carrier') {
    const [x1, y1] = p(8, 3.2).split(' ').map(Number) as [number, number];
    root.append(
      svg('rect', {
        x: x1,
        y: y1,
        width: orientation === 'horizontal' ? length - 12 : 3.6,
        height: orientation === 'horizontal' ? 3.6 : length - 12,
        rx: 0.8,
        class: 'ws-hull-deck',
      }),
    );
  } else {
    root.append(
      svg('path', {
        d: `M ${p(7, 5)} L ${p(length - 4, 5)}`,
        class: 'ws-hull-keel',
      }),
    );
  }
  for (const at of TURRETS[shipId]) {
    const [cx, cy] = p(at * length, 5).split(' ').map(Number) as [number, number];
    root.append(svg('circle', { cx, cy, r: shipId === 'submarine' ? 2 : 1.6, class: 'ws-hull-turret' }));
  }
  return root;
}
