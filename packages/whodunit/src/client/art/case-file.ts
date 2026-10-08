/**
 * The grand staircase in the middle of the board: steps rise on all four sides to a landing where
 * the sealed case file waits. Drawn in a 0 0 W H box.
 */

const INK = '#120a1f';
const GOLD = '#d9a441';
const GOLD_LIGHT = '#f5c96b';
const PINK = '#ff4fa3';
const STEPS = ['#1d1030', '#241439', '#2c1a45', '#352151', '#3e285e'];

const n = (v: number): string => String(Math.round(v * 10) / 10);

export function caseFile(W: number, H: number): string {
  const cx = W / 2;
  const cy = H / 2;
  const s = Math.min(W, H);
  const rise = s * 0.045;
  let out = `<rect width="${W}" height="${H}" fill="${INK}"/>`;
  STEPS.forEach((fill, i) => {
    const inset = 1 + i * rise;
    out +=
      `<rect x="${n(inset)}" y="${n(inset)}" width="${n(W - inset * 2)}" height="${n(H - inset * 2)}" fill="${fill}"/>` +
      `<rect x="${n(inset)}" y="${n(inset)}" width="${n(W - inset * 2)}" height="${n(H - inset * 2)}" fill="none" stroke="${GOLD}" stroke-width=".5" opacity="${n(0.3 + i * 0.1)}"/>`;
  });
  const land = 1 + STEPS.length * rise;
  const runner = s * 0.16;
  out +=
    `<path d="M${n(cx - runner / 2)} 1H${n(cx + runner / 2)}V${n(H - 1)}H${n(cx - runner / 2)}ZM1 ${n(cy - runner / 2)}V${n(cy + runner / 2)}H${n(W - 1)}V${n(cy - runner / 2)}Z" fill="#6e1f4f" opacity=".85"/>` +
    `<path d="M${n(cx - runner / 2)} 1V${n(H - 1)}M${n(cx + runner / 2)} 1V${n(H - 1)}M1 ${n(cy - runner / 2)}H${n(W - 1)}M1 ${n(cy + runner / 2)}H${n(W - 1)}" stroke="${GOLD}" stroke-width=".4" opacity=".8"/>` +
    `<rect x="${n(land)}" y="${n(land)}" width="${n(W - land * 2)}" height="${n(H - land * 2)}" fill="#2a1745" stroke="${GOLD}" stroke-width="1"/>` +
    `<rect x="${n(land + 2)}" y="${n(land + 2)}" width="${n(W - land * 2 - 4)}" height="${n(H - land * 2 - 4)}" fill="none" stroke="${PINK}" stroke-width=".4" opacity=".5"/>`;
  for (const [x, y] of [
    [land, land],
    [W - land, land],
    [land, H - land],
    [W - land, H - land],
    [2.5, 2.5],
    [W - 2.5, 2.5],
    [2.5, H - 2.5],
    [W - 2.5, H - 2.5],
  ] as const) {
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="1.8" fill="${GOLD}" stroke="${INK}" stroke-width=".6"/><circle cx="${n(x - 0.5)}" cy="${n(y - 0.5)}" r=".6" fill="${GOLD_LIGHT}"/>`;
  }
  const ew = s * 0.42;
  const eh = ew * 0.68;
  const ex = cx - ew / 2;
  const ey = cy - eh / 2;
  const r = ew * 0.17;
  const q = r * 0.5;
  out +=
    `<rect x="${n(ex - 3)}" y="${n(ey - 3)}" width="${n(ew + 6)}" height="${n(eh + 6)}" rx="3" fill="${PINK}" opacity=".16"/>` +
    `<rect x="${n(ex + 1)}" y="${n(ey + 1.5)}" width="${n(ew)}" height="${n(eh)}" rx="1" fill="${INK}" opacity=".5"/>` +
    `<g transform="rotate(-4 ${n(cx)} ${n(cy)})">` +
    `<rect x="${n(ex)}" y="${n(ey)}" width="${n(ew)}" height="${n(eh)}" rx="1" fill="#eadcbc" stroke="#8a6a3a" stroke-width=".6"/>` +
    `<path d="M${n(ex)} ${n(ey + eh)}L${n(cx)} ${n(cy + eh * 0.05)}L${n(ex + ew)} ${n(ey + eh)}" fill="none" stroke="#b89a66" stroke-width=".6"/>` +
    `<path d="M${n(ex)} ${n(ey)}L${n(cx)} ${n(cy + eh * 0.12)}L${n(ex + ew)} ${n(ey)}Z" fill="#dccaa3" stroke="#8a6a3a" stroke-width=".6" stroke-linejoin="round"/>` +
    `<path d="M${n(ex + 1.5)} ${n(ey + 1.5)}H${n(ex + ew * 0.35)}" stroke="#fff" stroke-width=".6" opacity=".6"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy + eh * 0.12)}" r="${n(r * 1.18)}" fill="#c2185b" opacity=".6"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy + eh * 0.12)}" r="${n(r)}" fill="${PINK}" stroke="#8a0f45" stroke-width=".7"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy + eh * 0.12)}" r="${n(r * 0.72)}" fill="none" stroke="#c2185b" stroke-width=".5"/>` +
    `<path d="M${n(cx - q * 0.7)} ${n(cy + eh * 0.12 - q * 0.45)}C${n(cx - q * 0.7)} ${n(cy + eh * 0.12 - q * 1.2)} ${n(cx + q * 0.7)} ${n(cy + eh * 0.12 - q * 1.2)} ${n(cx + q * 0.7)} ${n(cy + eh * 0.12 - q * 0.45)}C${n(cx + q * 0.7)} ${n(cy + eh * 0.12)} ${n(cx)} ${n(cy + eh * 0.12)} ${n(cx)} ${n(cy + eh * 0.12 + q * 0.3)}" fill="none" stroke="#7a1046" stroke-width="${n(r * 0.2)}" stroke-linecap="round"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy + eh * 0.12 + q * 0.8)}" r="${n(r * 0.11)}" fill="#7a1046"/>` +
    `<circle cx="${n(cx - r * 0.4)}" cy="${n(cy + eh * 0.12 - r * 0.45)}" r="${n(r * 0.15)}" fill="#fff" opacity=".6"/>` +
    `</g>`;
  return out;
}
