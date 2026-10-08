import { SUSPECT_COLOR, SUSPECT_IDS } from '../../rules/constants.js';
import type { RoomId } from '../../rules/types.js';

/**
 * Top-down floor plans in a 0 0 W H box (10 units per square). Furniture hugs the walls and keeps
 * clear of each room's doors (see ROOM_LAYOUT) so the middle stays open for tokens.
 */

const INK = '#120a1f';
const GOLD = '#d9a441';
const GOLD_LIGHT = '#f5c96b';
const PINK = '#ff4fa3';
const EDGE = `stroke="${INK}" stroke-width="1"`;

const n = (v: number): string => String(Math.round(v * 10) / 10);

function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

function circle(cx: number, cy: number, r: number, fill: string, extra = ''): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

/** A soft drop shadow under a piece of furniture. */
function shadow(x: number, y: number, w: number, h: number, rx = 1.5): string {
  return rect(x + 0.8, y + 1.2, w, h, INK, `rx="${rx}" opacity=".45"`);
}

function planks(W: number, H: number, base: string, line: string, size = 5, vertical = false): string {
  let d = '';
  const [long, short] = vertical ? [H, W] : [W, H];
  for (let i = 0, row = 0; i < short; i += size, row++) {
    if (i > 0) {
      d += vertical ? `M${i} 0V${long}` : `M0 ${i}H${long}`;
    }
    for (let j = ((row * 7) % 20) + 4; j < long; j += 20) {
      d += vertical ? `M${i} ${j}h${size}` : `M${j} ${i}v${size}`;
    }
  }
  return rect(0, 0, W, H, base) + `<path d="${d}" stroke="${line}" stroke-width=".6"/>`;
}

function checker(W: number, H: number, size: number, a: string, b: string): string {
  let d = '';
  for (let y = 0, row = 0; y < H; y += size, row++) {
    for (let x = (row % 2) * size; x < W; x += size * 2) {
      d += `M${x} ${y}h${size}v${size}h-${size}Z`;
    }
  }
  return rect(0, 0, W, H, a) + `<path d="${d}" fill="${b}"/>`;
}

function flagstones(W: number, H: number): string {
  let out = rect(0, 0, W, H, '#15101d');
  const shades = ['#2c2536', '#352c40', '#27202e', '#30293a', '#2a2433'];
  for (let y = 0, row = 0; y < H; row++) {
    const h = 7 + ((row * 5) % 3) * 1.5;
    for (let x = -((row * 4) % 9), k = row * 3; x < W; k++) {
      const w = 8 + ((k * 7 + row * 3) % 5) * 2;
      out += rect(x + 0.6, y + 0.6, w - 1.2, h - 1.2, shades[k % shades.length] ?? '#2c2536', `rx="${1 + (k % 3) * 0.6}"`);
      x += w;
    }
    y += h;
  }
  return out;
}

function walls(W: number, H: number): string {
  return (
    rect(1, 1, W - 2, H - 2, 'none', `stroke="${INK}" stroke-width="2"`) +
    rect(2.6, 2.6, W - 5.2, H - 5.2, 'none', `stroke="${GOLD}" stroke-width=".5" opacity=".45"`)
  );
}

function leaves(cx: number, cy: number, r: number): string {
  return (
    circle(cx - r * 0.4, cy, r * 0.75, '#2a8f5c') +
    circle(cx + r * 0.45, cy - r * 0.2, r * 0.7, '#3bbf7a') +
    circle(cx, cy + r * 0.35, r * 0.6, '#239152') +
    circle(cx + r * 0.2, cy - r * 0.35, r * 0.25, '#8ff0b4', 'opacity=".7"')
  );
}

function planter(x: number, y: number, w: number, h: number): string {
  let out = shadow(x, y, w, h) + rect(x, y, w, h, '#6b4226', `rx="1.5" ${EDGE}`) + rect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, '#2e1d14', 'rx="1"');
  const along = w >= h;
  const span = along ? w : h;
  const r = (along ? h : w) * 0.36;
  const count = Math.max(1, Math.floor((span - 2) / (r * 2.4)));
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) * span) / count;
    out += along ? leaves(x + t, y + h / 2, r) : leaves(x + w / 2, y + t, r);
  }
  return out;
}

function observatory(W: number, H: number): string {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.34;
  let ribs = '';
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    ribs += `M${n(cx + Math.cos(a) * R)} ${n(cy + Math.sin(a) * R)}L${n(cx + Math.cos(a) * W)} ${n(cy + Math.sin(a) * H)}`;
  }
  const stars: Array<[number, number]> = [
    [-0.55, -0.35],
    [-0.2, -0.6],
    [0.25, -0.45],
    [0.6, -0.1],
    [0.35, 0.4],
    [-0.15, 0.55],
    [-0.6, 0.25],
  ];
  const pts = stars.map(([x, y]) => [cx + x * R, cy + y * R] as const);
  return (
    planks(W, H, '#1b1736', '#262150') +
    `<path d="${ribs}" stroke="#3d3678" stroke-width=".6" opacity=".7"/>` +
    circle(cx, cy, R, '#24184c', `stroke="${GOLD}" stroke-width="1.2"`) +
    circle(cx, cy, R - 2.5, 'none', `stroke="${GOLD}" stroke-width=".4" opacity=".7"`) +
    `<path d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}" fill="none" stroke="#9b8ee0" stroke-width=".4" opacity=".7"/>` +
    pts.map(([x, y], i) => circle(x, y, i % 3 === 0 ? 1.1 : 0.7, GOLD_LIGHT)).join('') +
    `<path d="M${n(cx)} ${n(cy - 4)}L${n(cx + 1)} ${n(cy - 1)} ${n(cx + 4)} ${n(cy)} ${n(cx + 1)} ${n(cy + 1)} ${n(cx)} ${n(cy + 4)} ${n(cx - 1)} ${n(cy + 1)} ${n(cx - 4)} ${n(cy)} ${n(cx - 1)} ${n(cy - 1)}Z" fill="${GOLD}" opacity=".35"/>` +
    circle(14, 14, 8, INK, 'opacity=".45"') +
    circle(13, 13, 8, '#2e2450', `stroke="${GOLD}" stroke-width=".9"`) +
    `<g transform="translate(13 13) rotate(225)">` +
    rect(-7, -2, 7, 4, GOLD, `rx="1" ${EDGE}`) +
    rect(-1, -3, 10, 6, GOLD, `rx="1" ${EDGE}`) +
    rect(8, -3.8, 4, 7.6, '#9a6a1c', `rx="1" ${EDGE}`) +
    `<path d="M-6 -1H-1M0 -2H8" stroke="${GOLD_LIGHT}" stroke-width=".8"/></g>` +
    circle(13, 13, 2.4, '#9a6a1c', EDGE) +
    shadow(W - 16, 4, 12, 10) +
    rect(W - 16, 4, 12, 10, '#4a2c3a', `rx="1" ${EDGE}`) +
    rect(W - 15, 5, 10, 8, '#e3d3a8', 'rx=".5"') +
    `<path d="M${W - 14} 11L${W - 11} 7 ${W - 8} 9 ${W - 6} 6" stroke="#5a3f8a" stroke-width=".4" fill="none"/>` +
    circle(W - 11, 7, 0.6, '#5a3f8a') +
    circle(W - 8, 9, 0.6, '#5a3f8a') +
    circle(10, H - 10, 5.6, INK, 'opacity=".45"') +
    circle(9.5, H - 10.5, 5, '#2c4a8f', `stroke="${GOLD}" stroke-width="1"`) +
    `<ellipse cx="9.5" cy="${H - 10.5}" rx="2" ry="5" fill="none" stroke="#7fb0ff" stroke-width=".5"/>` +
    `<path d="M4.5 ${H - 10.5}H14.5" stroke="#7fb0ff" stroke-width=".5"/>` +
    shadow(W - 19, H - 8, 15, 5, 0.5) +
    rect(W - 19, H - 8, 15, 5, '#3a2414', `${EDGE}`) +
    `<path d="M${W - 17} ${H - 7}v3M${W - 15.5} ${H - 7}v3M${W - 13} ${H - 7}v3M${W - 11} ${H - 7}v3M${W - 9.5} ${H - 7}v3M${W - 7} ${H - 7}v3" stroke-width="1.1" stroke="${PINK}" opacity=".8"/>` +
    walls(W, H)
  );
}

function frame(x: number, y: number, w: number, h: number, canvas: string): string {
  return (
    rect(x, y, w, h, GOLD, `${EDGE} stroke-width=".6"`) +
    rect(x + 1, y + 1, w - 2, h - 2, canvas) +
    circle(x + w / 2, y + h * 0.45, Math.min(w, h) * 0.16, INK, 'opacity=".55"') +
    `<path d="M${n(x + w * 0.25)} ${n(y + h - 1)}Q${n(x + w / 2)} ${n(y + h * 0.55)} ${n(x + w * 0.75)} ${n(y + h - 1)}Z" fill="${INK}" opacity=".55"/>`
  );
}

function bustOnPlinth(x: number, y: number): string {
  return shadow(x, y, 8, 8, 0.5) + rect(x, y, 8, 8, '#3a2b58', EDGE) + circle(x + 4, y + 4, 2.8, '#ece6f4', `stroke="#b3a6cc" stroke-width=".6"`);
}

function gallery(W: number, H: number): string {
  const colors = SUSPECT_IDS.map((id) => SUSPECT_COLOR[id]);
  const count = Math.max(2, Math.floor((W - 10) / 13));
  const gap = (W - 8) / count;
  const runnerY = H * 0.64;
  let frames = '';
  for (let i = 0; i < count; i++) {
    frames += frame(4 + gap * i + (gap - 9) / 2, 3.5, 9, 6.5, colors[i % colors.length] ?? PINK);
  }
  for (const [i, y] of [10, 22].entries()) {
    frames += frame(3.5, y, 5, 9, colors[(i + 2) % colors.length] ?? PINK);
    frames += frame(W - 8.5, y, 5, 9, colors[(i + 4) % colors.length] ?? PINK);
  }
  const bench = (x: number, y: number): string =>
    shadow(x, y, 14, 5) + rect(x, y, 14, 5, '#4a2c1c', `rx="1.2" ${EDGE}`) + rect(x + 1, y + 1, 12, 3, '#b8236f', 'rx=".8"');
  return (
    planks(W, H, '#36202e', '#48293d') +
    rect(3, runnerY - 6, W - 6, 12, '#5a1a44') +
    rect(4.5, runnerY - 4.5, W - 9, 9, 'none', `stroke="${GOLD}" stroke-width=".6" opacity=".8"`) +
    rect(6, runnerY - 3, W - 12, 6, 'none', `stroke="${PINK}" stroke-width=".4" opacity=".5"`) +
    frames +
    bench(W * 0.3 - 7, 16) +
    bench(W * 0.7 - 7, 16) +
    bench(W / 2 - 7, H - 10) +
    bustOnPlinth(4, H - 13) +
    bustOnPlinth(W - 12, H - 13) +
    walls(W, H)
  );
}

function greenhouse(W: number, H: number): string {
  const fx = W - 14;
  const fy = 14;
  let glass = '';
  for (let x = 10; x < W; x += 10) {
    glass += `M${x} 0V${H}`;
  }
  for (let y = 10; y < H; y += 10) {
    glass += `M0 ${y}H${W}`;
  }
  let fronds = '';
  for (let i = 0; i < 7; i++) {
    const a = (i * 2 * Math.PI) / 7 + 0.3;
    fronds += `M${W - 11} ${H - 11}l${n(Math.cos(a) * 8)} ${n(Math.sin(a) * 8)}`;
  }
  return (
    checker(W, H, 5, '#173029', '#1b382f') +
    planter(4, 4, W - 28, 8) +
    planter(4, 15, 8, 12) +
    planter(W - 12, 27, 8, 13) +
    planter(4, H - 12, 13, 8) +
    circle(fx + 1, fy + 1.5, 9.5, INK, 'opacity=".45"') +
    circle(fx, fy, 9.5, '#8d84a8', EDGE) +
    circle(fx, fy, 7.6, '#2fb3a5') +
    circle(fx, fy, 5.4, 'none', 'stroke="#a7fff4" stroke-width=".5" opacity=".6"') +
    circle(fx, fy, 3.6, '#8d84a8', EDGE) +
    circle(fx, fy, 2.2, '#3dd6c4') +
    circle(fx - 0.5, fy - 0.5, 0.9, '#e8fffb') +
    circle(W - 11, H - 11, 4.2, '#b5653a', EDGE) +
    `<path d="${fronds}" stroke="#2a8f5c" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="${fronds}" stroke="#7fe0a4" stroke-width=".6" stroke-linecap="round"/>` +
    `<path d="${glass}" stroke="#bdfcf2" stroke-width=".5" opacity=".16"/>` +
    `<path d="M0 ${H * 0.55}L${W * 0.55} 0H${W * 0.7}L0 ${H * 0.7}Z" fill="#fff" opacity=".04"/>` +
    walls(W, H)
  );
}

function flask(x: number, y: number, fill: string): string {
  return circle(x, y, 2.4, fill, EDGE) + rect(x - 0.7, y - 4.4, 1.4, 2.4, '#d8e6ff', 'opacity=".7"') + circle(x - 0.8, y - 0.8, 0.6, '#fff', 'opacity=".8"');
}

function laboratory(W: number, H: number): string {
  const tx = W - 13;
  const ty = 13;
  const bench = (x: number, y: number, w: number, h: number): string =>
    shadow(x, y, w, h) + rect(x, y, w, h, '#3b2e4f', `rx="1" ${EDGE}`) + rect(x + 1, y + 1, w - 2, h - 2, '#54436f', 'rx=".6"');
  let bolts = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 + 0.4;
    const p = (r: number, s: number): string => `${n(tx + Math.cos(a + s) * r)} ${n(ty + Math.sin(a + s) * r)}`;
    bolts += `M${p(3, 0)}L${p(5.5, 0.35)} ${p(7.5, -0.15)} ${p(10.5, 0.2)}`;
  }
  const liquids = ['#5dff9a', PINK, '#3dd6c4', '#ffb23d', '#a77bff'];
  return (
    checker(W, H, 6, '#18202e', '#1e283a') +
    bench(3, 3, 9, H - 6) +
    bench(12, H - 12, W - 27, 9) +
    liquids.map((c, i) => flask(7.5, 9 + i * ((H - 20) / 4), c)).join('') +
    rect(17, H - 10, 5, 5, '#d8e6ff', `opacity=".35" ${EDGE}`) +
    rect(17.6, H - 7.6, 3.8, 2.2, '#3dd6c4', 'opacity=".9"') +
    rect(26, H - 10, 5, 5, '#d8e6ff', `opacity=".35" ${EDGE}`) +
    rect(26.6, H - 8.2, 3.8, 2.8, PINK, 'opacity=".9"') +
    flask(37, H - 7.5, '#5dff9a') +
    circle(tx, ty, 10.5, 'none', `stroke="${INK}" stroke-width="2.4"`) +
    circle(tx, ty, 10.5, 'none', `stroke="${GOLD_LIGHT}" stroke-width="1.8" stroke-dasharray="2.6 2.6"`) +
    circle(tx + 1, ty + 1.5, 7, INK, 'opacity=".45"') +
    circle(tx, ty, 7, '#2a1a33', EDGE) +
    circle(tx, ty, 5.6, 'none', 'stroke="#d98a41" stroke-width="1"') +
    circle(tx, ty, 4.2, 'none', 'stroke="#d98a41" stroke-width="1"') +
    `<path d="${bolts}" stroke="#a77bff" stroke-width="1.6" fill="none" stroke-linejoin="round" opacity=".7"/>` +
    `<path d="${bolts}" stroke="#f3ecff" stroke-width=".5" fill="none" stroke-linejoin="round"/>` +
    circle(tx, ty, 2.8, '#d8d4e6', EDGE) +
    circle(tx - 0.8, ty - 0.8, 0.9, '#fff') +
    shadow(W - 12, H - 12, 8, 8, 0.5) +
    rect(W - 12, H - 12, 8, 8, '#6b4226', EDGE) +
    `<path d="M${W - 12} ${H - 12}l8 8M${W - 4} ${H - 12}l-8 8" stroke="#3a2414" stroke-width=".8"/>` +
    walls(W, H)
  );
}

function music(W: number, H: number): string {
  const x = W - 32;
  const y = 4;
  let keys = '';
  for (let k = 1.5; k < 17; k += 2.2) {
    keys += `M${n(x + 1)} ${n(y + k)}h2.2`;
  }
  let strings = '';
  for (let s = 0; s < 6; s++) {
    strings += `M${n(W - 15 + s * 1.2)} ${n(H - 6 - s * 0.4)}L${n(W - 15 + s * 1.2)} ${n(H - 18 + s * 1.6)}`;
  }
  const stand = (sx: number, sy: number, a: number): string =>
    `<g transform="rotate(${a} ${sx} ${sy})">${rect(sx - 3.5, sy - 1, 7, 2, '#e3d3a8', EDGE)}<path d="M${sx - 2.5} ${sy}h5" stroke="#5a3f8a" stroke-width=".3"/></g>` +
    circle(sx, sy + 2.4, 0.8, GOLD);
  return (
    planks(W, H, '#2a1a2e', '#38233d') +
    `<ellipse cx="${n(W * 0.42)}" cy="${n(H * 0.58)}" rx="${n(W * 0.27)}" ry="${n(H * 0.25)}" fill="#3a1640" stroke="${GOLD}" stroke-width=".8"/>` +
    `<ellipse cx="${n(W * 0.42)}" cy="${n(H * 0.58)}" rx="${n(W * 0.23)}" ry="${n(H * 0.21)}" fill="none" stroke="${PINK}" stroke-width=".4" opacity=".5"/>` +
    `<path d="M${x + 4} ${y}H${x + 18}C${x + 26} ${y} ${x + 28} ${y + 4} ${x + 28} ${y + 8}C${x + 28} ${y + 12} ${x + 24} ${y + 12} ${x + 20} ${y + 13}C${x + 16} ${y + 14} ${x + 14} ${y + 18} ${x + 10} ${y + 18}H${x + 4}Z" fill="${INK}" opacity=".45" transform="translate(1 1.4)"/>` +
    `<path d="M${x + 4} ${y}H${x + 18}C${x + 26} ${y} ${x + 28} ${y + 4} ${x + 28} ${y + 8}C${x + 28} ${y + 12} ${x + 24} ${y + 12} ${x + 20} ${y + 13}C${x + 16} ${y + 14} ${x + 14} ${y + 18} ${x + 10} ${y + 18}H${x + 4}Z" fill="#1a1024" stroke="#4a3866" stroke-width=".8"/>` +
    `<path d="M${x + 6} ${y + 3}H${x + 22}M${x + 6} ${y + 7}H${x + 24}M${x + 6} ${y + 11}H${x + 18}" stroke="${GOLD}" stroke-width=".3" opacity=".6"/>` +
    `<path d="M${x + 7} ${y + 1.5}L${x + 20} ${y + 1.5}" stroke="#fff" stroke-width=".8" opacity=".2" stroke-linecap="round"/>` +
    rect(x, y, 4, 18, '#f4efe7', EDGE) +
    `<path d="${keys}" stroke="${INK}" stroke-width="1"/>` +
    rect(x - 7, y + 5, 5, 8, '#4a2c1c', `rx="1" ${EDGE}`) +
    stand(10, 9, -12) +
    stand(19, 7, 8) +
    `<path d="M${W - 16} ${H - 5}L${W - 16} ${H - 19}C${W - 12} ${H - 21} ${W - 9} ${H - 17} ${W - 7} ${H - 15}L${W - 9} ${H - 5}Z" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M${W - 16} ${H - 5}L${W - 16} ${H - 19}C${W - 12} ${H - 21} ${W - 9} ${H - 17} ${W - 7} ${H - 15}L${W - 9} ${H - 5}Z" fill="#2a1745" stroke="${GOLD}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="${strings}" stroke="${GOLD_LIGHT}" stroke-width=".3"/>` +
    circle(8, H - 9, 3.4, '#4a2c1c', EDGE) +
    circle(8, H - 9, 2.2, '#b8236f') +
    walls(W, H)
  );
}

function theater(W: number, H: number): string {
  const sx = W - 18;
  let lights = '';
  for (let y = 8; y < H - 6; y += 5) {
    lights += circle(sx + 1.5, y, 2.6, GOLD_LIGHT, 'opacity=".18"') + circle(sx + 1.5, y, 0.9, GOLD_LIGHT);
  }
  let folds = '';
  for (let y = 3; y < H - 3; y += 3) {
    folds += `M${W - 7} ${y}h4`;
  }
  const seat = (x: number, y: number): string => shadow(x, y, 5, 5) + rect(x, y, 5, 5, '#8a2457', `rx="1.4" ${EDGE}`) + rect(x, y, 1.6, 5, '#4f1236', 'rx=".8"');
  const seats = [6, 13].flatMap((x) => [5, 11, H - 16, H - 10].map((y) => seat(x, y))).join('');
  const drape = (y: number, flip: number): string =>
    `<path d="M${sx} ${y}H${W - 3}V${y + flip * 8}C${W - 7} ${y + flip * 4} ${sx + 6} ${y + flip * 10} ${sx} ${y + flip * 6}Z" fill="#c2185b" ${EDGE}/>` +
    `<path d="M${sx + 4} ${y + flip}V${y + flip * 6}M${sx + 8} ${y + flip}V${y + flip * 6}M${sx + 12} ${y + flip}V${y + flip * 6}" stroke="#7a0f3a" stroke-width=".8"/>`;
  return (
    rect(0, 0, W, H, '#2a0f2c') +
    `<path d="M0 ${n(H / 4)}H${sx}M0 ${n((H * 3) / 4)}H${sx}" stroke="#3a1640" stroke-width="10" opacity=".5"/>` +
    rect(3, 21, sx - 3, 8, '#4a1440') +
    `<path d="M3 22H${sx}M3 28H${sx}" stroke="${GOLD}" stroke-width=".4" opacity=".7"/>` +
    seats +
    `<g transform="translate(${sx} 0)">${planks(W - sx, H, '#5a3424', '#6e4330', 4, true)}</g>` +
    `<path d="M${sx} 0V${H}" stroke="${GOLD}" stroke-width="1.2"/>` +
    lights +
    rect(W - 7, 3, 4, H - 6, '#a3164f') +
    `<path d="${folds}" stroke="#ff4fa3" stroke-width=".5" opacity=".5"/>` +
    drape(3, 1) +
    drape(H - 3, -1) +
    walls(W, H)
  );
}

function barrel(cx: number, cy: number): string {
  return (
    circle(cx + 1, cy + 1.4, 5.6, INK, 'opacity=".45"') +
    circle(cx, cy, 5.6, '#6b4126', `stroke="#2a1a12" stroke-width="1.2"`) +
    circle(cx, cy, 4.2, 'none', 'stroke="#2a1a12" stroke-width=".6"') +
    `<path d="M${cx - 4} ${cy}h8M${cx - 3.4} ${cy - 2}h6.8M${cx - 3.4} ${cy + 2}h6.8" stroke="#4a2c18" stroke-width=".4"/>` +
    circle(cx + 1.6, cy - 1.4, 0.8, '#1a0f0a')
  );
}

function rack(x: number, y: number, w: number, h: number): string {
  let bottles = '';
  for (let by = y + 2; by < y + h - 1; by += 3.2) {
    for (let bx = x + 2, k = 0; bx < x + w - 1; bx += 3.2, k++) {
      bottles += circle(bx, by, 1.2, k % 3 === 0 ? '#2a5a3a' : '#5a1745') + circle(bx - 0.4, by - 0.4, 0.35, '#fff', 'opacity=".45"');
    }
  }
  return shadow(x, y, w, h, 0.5) + rect(x, y, w, h, '#3b2617', EDGE) + bottles + `<path d="M${x} ${y + h / 2}h${w}" stroke="#5a3a22" stroke-width=".3"/>`;
}

function cellar(W: number, H: number): string {
  return (
    flagstones(W, H) +
    rack(3, 3, 24, 9) +
    rack(42, 3, W - 45, 9) +
    rack(W - 11, 32, 8, H - 50) +
    barrel(10, H - 10) +
    barrel(21.5, H - 10) +
    barrel(10, H - 21.5) +
    barrel(W - 10, H - 10) +
    circle(W - 10, H - 10, 4.5, GOLD_LIGHT, 'opacity=".18"') +
    circle(W - 10, H - 10, 1.4, '#f4efe7') +
    circle(W - 10, H - 10.4, 0.6, '#ffb23d') +
    walls(W, H)
  );
}

function stairs(ox: number, oy: number, sx: number, sy: number): string {
  let out = `<path d="M${ox} ${oy}h${sx * 20}A20 20 0 0 ${sx * sy > 0 ? 1 : 0} ${ox} ${oy + sy * 20}Z" fill="#4a3870" ${EDGE}/>`;
  for (let r = 6; r < 20; r += 2.8) {
    out += `<path d="M${ox + sx * r} ${oy}A${r} ${r} 0 0 ${sx * sy > 0 ? 1 : 0} ${ox} ${oy + sy * r}" fill="none" stroke="#c9bfe0" stroke-width=".8" opacity=".8"/>`;
  }
  return out + circle(ox + sx * 20, oy, 1.6, GOLD, EDGE) + circle(ox, oy + sy * 20, 1.6, GOLD, EDGE);
}

function pottedPlant(cx: number, cy: number): string {
  return circle(cx + 0.8, cy + 1.2, 4.6, INK, 'opacity=".45"') + circle(cx, cy, 4.6, '#b5653a', EDGE) + leaves(cx, cy, 3.6);
}

function foyer(W: number, H: number): string {
  const cx = W / 2;
  const cy = H / 2;
  let veins = '';
  for (let x = -H; x < W; x += 13) {
    veins += `M${x} ${H}Q${x + H * 0.5} ${H * 0.45} ${x + H} 0`;
  }
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const b = a + Math.PI / 8;
    rays += `M${n(cx + Math.cos(a) * 9)} ${n(cy + Math.sin(a) * 9)}L${n(cx + Math.cos(b) * 3)} ${n(cy + Math.sin(b) * 3)} ${n(cx + Math.cos(a + Math.PI / 4) * 9)} ${n(cy + Math.sin(a + Math.PI / 4) * 9)}`;
  }
  return (
    checker(W, H, 10, '#6f6390', '#2e2147') +
    `<path d="${veins}" stroke="#fff" stroke-width=".4" fill="none" opacity=".08"/>` +
    circle(cx, cy, 19, INK, 'opacity=".16"') +
    circle(cx, cy, 12, '#2a1745', `stroke="${GOLD}" stroke-width="1"`) +
    `<path d="${rays}" fill="none" stroke="${GOLD_LIGHT}" stroke-width=".7" opacity=".7"/>` +
    circle(cx, cy, 2, GOLD, 'opacity=".8"') +
    stairs(3, H - 3, 1, -1) +
    stairs(W - 3, H - 3, -1, -1) +
    rect(cx - 9, H - 7, 18, 4.5, '#7a1f4f', `rx="1" ${EDGE}`) +
    rect(cx - 7.5, H - 6, 15, 2.5, 'none', `stroke="${GOLD}" stroke-width=".5"`) +
    pottedPlant(9, 9) +
    pottedPlant(W - 9, 9) +
    walls(W, H)
  );
}

function parlor(W: number, H: number): string {
  const fy = H / 2;
  const chair = (x: number, y: number): string =>
    shadow(x, y, 8, 8, 2) + rect(x, y, 8, 8, '#7a1f4f', `rx="2" ${EDGE}`) + rect(x + 1.5, y + 1.5, 5, 5, '#a8326f', 'rx="1.2"') + rect(x, y, 2, 8, '#5a1238', 'rx="1"');
  return (
    planks(W, H, '#2a1626', '#371d31') +
    rect(8, 8, W - 22, H - 18, '#4a1a3a') +
    rect(9.5, 9.5, W - 25, H - 21, 'none', `stroke="${GOLD}" stroke-width=".8"`) +
    rect(12, 12, W - 30, H - 26, 'none', `stroke="${PINK}" stroke-width=".4" opacity=".5"`) +
    circle(W - 8, fy, 13, '#ff6a3d', 'opacity=".14"') +
    rect(W - 8, fy - 10, 5, 20, '#5a4f6e', EDGE) +
    rect(W - 7, fy - 6, 4, 12, INK) +
    `<path d="M${W - 4} ${fy - 4}Q${W - 8} ${fy - 2} ${W - 5} ${fy}Q${W - 8} ${fy + 2} ${W - 4} ${fy + 4}Z" fill="#ff6a3d"/>` +
    `<path d="M${W - 4} ${fy - 2}Q${W - 6.5} ${fy} ${W - 4} ${fy + 2}Z" fill="${GOLD_LIGHT}"/>` +
    chair(W - 19, fy - 15) +
    chair(W - 19, fy + 7) +
    shadow(14, H - 10, 24, 7) +
    rect(14, H - 10, 24, 7, '#4b2a8a', `rx="2" ${EDGE}`) +
    rect(14, H - 5.5, 24, 2.5, '#36206a', 'rx="1"') +
    `<path d="M22 ${H - 9}v3.5M30 ${H - 9}v3.5" stroke="#36206a" stroke-width=".8"/>` +
    rect(14, H - 10, 2.5, 7, '#36206a', 'rx="1"') +
    rect(35.5, H - 10, 2.5, 7, '#36206a', 'rx="1"') +
    circle(12.8, 13.2, 6.5, INK, 'opacity=".45"') +
    circle(12, 12, 6.5, '#1f5a46', `stroke="#6b4226" stroke-width="1.4"`) +
    `<g transform="rotate(-20 10 11)">${rect(8.5, 9, 3, 4.2, '#f4efe7', 'rx=".4"')}${circle(10, 11.1, 0.6, PINK)}</g>` +
    `<g transform="rotate(15 14 13)">${rect(12.5, 11, 3, 4.2, '#f4efe7', 'rx=".4"')}${circle(14, 13.1, 0.6, INK)}</g>` +
    circle(6, H - 6, 4, GOLD_LIGHT, 'opacity=".18"') +
    circle(6, H - 6, 2, GOLD, EDGE) +
    walls(W, H)
  );
}

/** Floor-plan builders for each room, sized by the room rect. */
export const ROOM_ART: Readonly<Record<RoomId, (W: number, H: number) => string>> = {
  observatory,
  gallery,
  greenhouse,
  laboratory,
  music,
  theater,
  cellar,
  foyer,
  parlor,
};
