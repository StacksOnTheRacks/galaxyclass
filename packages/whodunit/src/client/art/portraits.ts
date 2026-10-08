import { SUSPECT_COLOR } from '../../rules/constants.js';
import type { SuspectId } from '../../rules/types.js';

/**
 * Bust portraits in a 0 0 100 100 box. The face sits around (50, 46) so a circle of r46 frames it;
 * the background fills the whole square. No ids: soft light is layered translucent shapes.
 */

const INK = '#120a1f';
const GOLD = '#d9a441';
const GOLD_LIGHT = '#f5c96b';

interface Skin {
  base: string;
  shade: string;
  line: string;
}

const HEAD = 'M34 44C34 30 41 26 50 26S66 30 66 44C66 56 60 66 50 66S34 56 34 44Z';

/** Draws `markup` again reflected across the face's centre line. */
function both(markup: string): string {
  return `${markup}<g transform="matrix(-1 0 0 1 100 0)">${markup}</g>`;
}

function backdrop(fill: string, glow: string): string {
  return (
    `<rect width="100" height="100" fill="${fill}"/>` +
    [46, 39, 32, 25, 18].map((r) => `<circle cx="50" cy="44" r="${r}" fill="${glow}" opacity=".055"/>`).join('') +
    `<circle cx="50" cy="40" r="14" fill="#fff" opacity=".04"/>` +
    `<path d="M0 78Q50 66 100 78V100H0Z" fill="${INK}" opacity=".35"/>`
  );
}

function shoulders(fill: string, shade: string): string {
  return (
    `<path d="M8 100C10 84 24 77 40 75H60C76 77 90 84 92 100Z" fill="${fill}"/>` +
    `<path d="M74 80C84 84 90 90 92 100H78C78 92 77 86 74 80Z" fill="${shade}" opacity=".6"/>`
  );
}

function neck(s: Skin): string {
  return (
    `<path d="M42 56V72Q41 76 36 78H64Q59 76 58 72V56Z" fill="${s.base}"/>` +
    `<path d="M42 60Q50 70 58 60V67Q50 74 42 67Z" fill="${s.shade}" opacity=".8"/>`
  );
}

function head(s: Skin): string {
  return (
    both(`<ellipse cx="34" cy="47" rx="3.4" ry="5.2" fill="${s.base}"/><path d="M33 44Q35 47 34 50" stroke="${s.shade}" fill="none"/>`) +
    `<path d="${HEAD}" fill="${s.base}"/>` +
    `<path d="M57 27C63 30 66 36 66 44C66 56 60 66 50 66C57 61 61 52 61 42C61 35 60 31 57 27Z" fill="${s.shade}" opacity=".55"/>` +
    `<ellipse cx="43" cy="35" rx="6" ry="3" fill="#fff" opacity=".13"/>` +
    `<path d="M50.5 47Q48 54.5 49.5 55.6Q51 56.3 53 55" fill="none" stroke="${s.line}" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>`
  );
}

/** Two eyes; `look` shifts the irises, `lid` (0–3) lowers the upper lids. */
function eyes(iris: string, line: string, lid: string, look: { dx?: number; dy?: number; lid?: number } = {}): string {
  const dx = look.dx ?? 0;
  const dy = look.dy ?? 0;
  const drop = look.lid ?? 0;
  const one = (cx: number, shift: number): string =>
    `<ellipse cx="${cx}" cy="47" rx="3.5" ry="2.4" fill="#fbf6ff"/>` +
    `<circle cx="${cx + shift}" cy="${47.2 + dy}" r="1.9" fill="${iris}"/>` +
    `<circle cx="${cx + shift}" cy="${47.2 + dy}" r="1" fill="${INK}"/>` +
    `<circle cx="${cx + shift + 0.6}" cy="${46.5 + dy}" r=".55" fill="#fff"/>` +
    (drop > 0 ? `<path d="M${cx - 3.8} 47.2Q${cx} 43.6 ${cx + 3.8} 47.2Q${cx} ${45.4 + drop * 0.6} ${cx - 3.8} 47.2Z" fill="${lid}"/>` : '') +
    `<path d="M${cx - 3.8} 47Q${cx} ${43.8 + drop * 0.4} ${cx + 3.8} 47" fill="none" stroke="${line}" stroke-width="1.2" stroke-linecap="round"/>`;
  return one(43, dx) + one(57, dx);
}

const VESPER_SKIN: Skin = { base: '#f3cdb8', shade: '#dba68d', line: '#9a5a4a' };
const VESPER_HAIR = '#22113a';
const PINK = SUSPECT_COLOR.vesper;

function pearls(): string {
  let out = '';
  for (let i = 0; i <= 10; i++) {
    const a = ((20 + i * 14) * Math.PI) / 180;
    const x = (50 + Math.cos(a) * 11).toFixed(1);
    const y = (67 + Math.sin(a) * 10).toFixed(1);
    out += `<circle cx="${x}" cy="${y}" r="1.6" fill="#f7f1ff" stroke="#b7a6d8" stroke-width=".4"/>`;
  }
  return out;
}

const vesper =
  backdrop('#2a1745', PINK) +
  both('<path d="M14 18l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#f5c96b" opacity=".7"/>') +
  `<path d="M29 52C24 30 36 18 50 18S76 30 71 52C69 44 64 38 58 36H42C36 38 31 44 29 52Z" fill="${VESPER_HAIR}"/>` +
  `<ellipse cx="50" cy="17" rx="13" ry="9.5" fill="${VESPER_HAIR}"/>` +
  `<path d="M40 14Q50 7 60 14M43 19Q50 14 57 19" stroke="#4a2c72" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
  shoulders(VESPER_SKIN.base, VESPER_SKIN.shade) +
  neck(VESPER_SKIN) +
  `<path d="M8 100C10 90 16 86 25 86C34 86 40 93 50 93S66 86 75 86C84 86 90 90 92 100Z" fill="${PINK}"/>` +
  `<path d="M50 93V100M36 89Q40 96 38 100M64 89Q60 96 62 100" stroke="#b8236f" stroke-width="1.4" fill="none"/>` +
  `<path d="M8 100C10 90 16 86 25 86C21 89 18 94 17 100Z" fill="#fff" opacity=".18"/>` +
  pearls() +
  head(VESPER_SKIN) +
  `<path d="M33 46C30 30 40 24 50 24S70 30 67 46C65 38 60 33 53 33C47 30 38 34 33 46Z" fill="${VESPER_HAIR}"/>` +
  `<path d="M37 37Q44 28 56 29" stroke="#4a2c72" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M38 28L42.5 21 46 25.5 50 16.5 54 25.5 57.5 21 62 28Q50 25 38 28Z" fill="${GOLD_LIGHT}" stroke="#8a5a12" stroke-width=".6" stroke-linejoin="round"/>` +
  `<circle cx="50" cy="22.5" r="1.9" fill="${PINK}"/><circle cx="42.5" cy="24" r="1" fill="${PINK}"/><circle cx="57.5" cy="24" r="1" fill="${PINK}"/>` +
  `<ellipse cx="43" cy="45" rx="4.6" ry="2.6" fill="${PINK}" opacity=".35"/><ellipse cx="57" cy="45" rx="4.6" ry="2.6" fill="${PINK}" opacity=".35"/>` +
  eyes('#5a3a8a', INK, VESPER_SKIN.base, { lid: 2 }) +
  both('<path d="M39.2 46.4l-1.6-1.2M40.2 45.3l-1.2-1.6" stroke="#120a1f" stroke-width=".8" stroke-linecap="round"/>') +
  `<path d="M39 40.5Q43 37.8 47 40M53 40Q57 37.8 61 40.5" stroke="${VESPER_HAIR}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="40" cy="53" rx="3.4" ry="2" fill="${PINK}" opacity=".22"/><ellipse cx="60" cy="53" rx="3.4" ry="2" fill="${PINK}" opacity=".22"/>` +
  `<path d="M45.5 58.6Q48 56.8 50 57.9Q52 56.8 54.5 58.6Q50 62.4 45.5 58.6Z" fill="#d1245f"/>` +
  `<circle cx="58.5" cy="56.5" r=".7" fill="${INK}"/>` +
  both('<path d="M34 51.5V54" stroke="#d9a441" stroke-width=".7"/><circle cx="34" cy="55.6" r="1.9" fill="#f7f1ff" stroke="#b7a6d8" stroke-width=".4"/>');

const FINCH_SKIN: Skin = { base: '#a8693f', shade: '#87502d', line: '#5a3018' };
const AMBER = SUSPECT_COLOR.finch;
const SILVER = '#d4cedf';

function twinkle(x: number, y: number, r: number, fill: string, opacity = 1): string {
  return `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${fill}" opacity="${opacity}"/>`;
}

const finch =
  backdrop('#120a1f', AMBER) +
  [
    [14, 22, 2.2],
    [24, 10, 1.4],
    [86, 44, 1.6],
    [12, 56, 1.3],
    [90, 64, 1.1],
  ]
    .map(([x = 0, y = 0, r = 1]) => twinkle(x, y, r, '#fff', 0.75))
    .join('') +
  `<circle cx="78" cy="20" r="8" fill="${GOLD_LIGHT}"/><circle cx="82" cy="17" r="7" fill="#120a1f"/>` +
  shoulders('#4b3226', '#2f1e16') +
  `<path d="M24 82L18 100M78 82L84 100M30 90L34 100" stroke="#6b4a36" stroke-width=".8" opacity=".7"/>` +
  `<path d="M41 75L50 92 59 75Z" fill="#efe6d8"/>` +
  `<path d="M38 76L50 98 44 100H28L34 82Z" fill="#3a251b"/><path d="M62 76L50 98 56 100H72L66 82Z" fill="#3a251b"/>` +
  neck(FINCH_SKIN) +
  `<path d="M36 69Q50 80 64 69L66 77Q50 89 34 77Z" fill="${AMBER}"/>` +
  `<path d="M52 79L62 78 60 100H49Z" fill="${AMBER}"/><path d="M52 79L62 78 61 84Q56 83 52 85Z" fill="#c97f12" opacity=".6"/>` +
  `<path d="M49 100V97M52 100V97M55 100V97M58 100V97" stroke="#c97f12" stroke-width=".8"/>` +
  [
    [40, 75],
    [50, 81],
    [60, 75],
    [55, 90],
  ]
    .map(([x = 0, y = 0]) => twinkle(x, y, 2.2, '#2a1745'))
    .join('') +
  head(FINCH_SKIN) +
  both(`<path d="M33 49C30 40 33 32 38 30C36 36 37 42 38.5 48Z" fill="${SILVER}"/>`) +
  `<path d="M45 27.5Q46 22 49.5 25.5Q51 21.5 54.5 26.5" stroke="${SILVER}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="45" cy="31" rx="5" ry="2" fill="#fff" opacity=".18"/>` +
  `<path d="M38.5 41Q43 37.5 47.5 40M52.5 40Q57 37.5 61.5 41" stroke="${SILVER}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
  eyes('#3a2414', INK, FINCH_SKIN.base, { dy: -0.9 }) +
  both(`<circle cx="43" cy="47" r="5.6" fill="#fff" fill-opacity=".1" stroke="${GOLD}" stroke-width="1.5"/>`) +
  `<path d="M48.6 46.5Q50 45 51.4 46.5" stroke="${GOLD}" stroke-width="1.3" fill="none"/>` +
  both(`<path d="M37.4 46L34 45" stroke="${GOLD}" stroke-width="1.1"/><path d="M40 43.5Q41.5 42.5 43 42.8" stroke="#fff" stroke-width=".8" fill="none" opacity=".7"/>`) +
  `<path d="M43.5 58.2Q47 55.2 50 57Q53 55.2 56.5 58.2Q53 60.3 50 58.7Q47 60.3 43.5 58.2Z" fill="${SILVER}"/>` +
  `<path d="M46.5 61.2Q50 62.8 53.5 61.2" stroke="${FINCH_SKIN.line}" stroke-width="1" fill="none" stroke-linecap="round"/>`;

const JUNIPER_SKIN: Skin = { base: '#71422a', shade: '#55301d', line: '#2e160c' };
const JUNIPER_HAIR = '#160b16';
const TEAL = SUSPECT_COLOR.juniper;

const juniper =
  backdrop('#1d1030', TEAL) +
  `<path d="M36 0H64L90 100H10Z" fill="#fff" opacity=".05"/>` +
  `<circle cx="16" cy="30" r="5" fill="${TEAL}" opacity=".18"/><circle cx="84" cy="22" r="3.5" fill="${GOLD_LIGHT}" opacity=".2"/><circle cx="86" cy="52" r="6" fill="${TEAL}" opacity=".12"/>` +
  `<path d="M29 54C25 32 36 21 50 21S75 32 71 54C70 61 66 64 62 63V42H38V63C34 64 30 61 29 54Z" fill="${JUNIPER_HAIR}"/>` +
  shoulders(JUNIPER_SKIN.base, JUNIPER_SKIN.shade) +
  neck(JUNIPER_SKIN) +
  `<path d="M12 100C14 92 22 88 31 89C38 89 44 90 50 95C56 90 62 89 69 89C78 88 86 92 88 100Z" fill="${TEAL}"/>` +
  `<path d="M12 100C14 92 22 88 31 89C25 92 22 96 21 100Z" fill="#fff" opacity=".2"/>` +
  [
    [24, 94],
    [33, 92],
    [42, 96],
    [58, 96],
    [67, 92],
    [76, 95],
    [29, 98],
    [50, 99],
  ]
    .map(([x = 0, y = 0]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#e8fffb" opacity=".8"/>`)
    .join('') +
  head(JUNIPER_SKIN) +
  `<path d="M32.5 48C30 30 40 24 50 24S70 31 67.5 48C66 41 63 37 60 36C56 39 52 35 48 37C44 34 40 39 36 38C34.5 41 33.4 44 32.5 48Z" fill="${JUNIPER_HAIR}"/>` +
  `<path d="M35 36C39 31 43 37 47 32S55 34 60 30M36 30C40 26 45 31 50 27" stroke="#4a2c4e" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
  both(`<path d="M32.5 48C31 53 31 58 34 62C35 57 35 53 36 49Z" fill="${JUNIPER_HAIR}"/>`) +
  `<g transform="rotate(-28 36 30)"><path d="M36 31C29 21 30 8 36 1C42 8 43 21 36 31Z" fill="${TEAL}"/><path d="M36 30V4" stroke="#178a7e" stroke-width="1"/><path d="M36 22L31 17M36 16L32 11M36 22L41 17M36 16L40 11" stroke="#178a7e" stroke-width=".7"/></g>` +
  `<ellipse cx="37" cy="31" rx="4" ry="2.2" fill="${GOLD_LIGHT}" transform="rotate(-20 37 31)"/><circle cx="37" cy="31" r="1.2" fill="#ff4fa3"/>` +
  `<ellipse cx="43" cy="45" rx="4.6" ry="2.6" fill="${TEAL}" opacity=".35"/><ellipse cx="57" cy="45" rx="4.6" ry="2.6" fill="${TEAL}" opacity=".35"/>` +
  eyes('#2a160c', INK, JUNIPER_SKIN.base, { lid: 3, dx: 0.4 }) +
  both('<path d="M39.3 46.6l-1.7-1M40.3 45.6l-1.2-1.5" stroke="#120a1f" stroke-width=".8" stroke-linecap="round"/>') +
  `<path d="M39 40.6Q43 38 47 40M53 40Q57 38 61 40.6" stroke="${JUNIPER_HAIR}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
  `<path d="M45 58.6Q50 55.4 55 58.6Q50 64.6 45 58.6Z" fill="#b5123f"/><ellipse cx="50" cy="59.4" rx="2.6" ry="1.6" fill="#3a0716"/>` +
  both(`<circle cx="34" cy="55.5" r="3" fill="none" stroke="${GOLD_LIGHT}" stroke-width="1.1"/>`) +
  `<g transform="rotate(-14 76 80)"><rect x="73.5" y="84" width="5" height="18" fill="#3a3348"/><rect x="68" y="62" width="16" height="24" rx="8" fill="#cfc9dc"/>` +
  `<path d="M70 68H82M69 72H83M69 76H83M70 80H82" stroke="#6d6680" stroke-width="1"/><rect x="67.5" y="73" width="17" height="3" fill="${GOLD}"/>` +
  `<path d="M71 65Q72 63 74 63" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>`;

const ROOK_SKIN: Skin = { base: '#dca67c', shade: '#bb855c', line: '#6e4126' };
const BLUE = SUSPECT_COLOR.rook;
const LEATHER = '#6b4226';
const BEARD = '#8f8a9c';

const rook =
  backdrop('#120a1f', BLUE) +
  `<circle cx="80" cy="22" r="8" fill="#2c4a8f"/><path d="M73 18Q80 20 87 26" stroke="#5d86d6" stroke-width="1.3" fill="none" opacity=".6"/>` +
  `<ellipse cx="80" cy="22" rx="14" ry="3.6" fill="none" stroke="${GOLD_LIGHT}" stroke-width="1.1" transform="rotate(-18 80 22)" opacity=".8"/>` +
  twinkle(16, 22, 2, '#fff', 0.7) +
  twinkle(22, 60, 1.3, '#fff', 0.6) +
  shoulders(BLUE, '#2a5bbf') +
  `<path d="M50 84V100" stroke="#1d3f8a" stroke-width="1.2"/>` +
  `<path d="M28 92L34 89 40 92 34 91Z" fill="${GOLD_LIGHT}"/><circle cx="34" cy="91" r="1.2" fill="${GOLD}"/>` +
  neck(ROOK_SKIN) +
  `<path d="M28 78C33 70 42 70 46 76L50 84 54 76C58 70 67 70 72 78C67 85 59 84 55 82L50 89 45 82C41 84 33 85 28 78Z" fill="#ece0c6"/>` +
  `<path d="M31 78Q35 75 39 77M61 77Q65 75 69 78" stroke="#c8b998" stroke-width="1" fill="none"/>` +
  head(ROOK_SKIN) +
  `<path d="M35 50C36 61 42 67.5 50 67.5S64 61 65 50C62 56 58 58 55 57S48 56 45 57 38 56 35 50Z" fill="${BEARD}"/>` +
  `<path d="M38 56Q40 62 44 64M62 56Q60 62 56 64" stroke="#6f6a7c" stroke-width=".8" fill="none"/>` +
  `<path d="M43 57.8Q50 54.4 57 57.8Q50 57 43 57.8Z" fill="#6f6a7c"/><path d="M46 60.6H54" stroke="${ROOK_SKIN.line}" stroke-width="1.1" stroke-linecap="round"/>` +
  `<path d="M31.5 50C29.5 30 39 22 50 22S70.5 30 68.5 50H64.5C64.5 40 60 34.5 50 34.5S35.5 40 35.5 50Z" fill="${LEATHER}"/>` +
  both(`<path d="M31.5 41H36.5L37.5 59Q34 62 31 58Z" fill="${LEATHER}"/><path d="M33 50H36" stroke="#4a2c18" stroke-width="1"/>`) +
  `<path d="M50 22V34.5M40 24Q38 30 38 34" stroke="#4a2c18" stroke-width="1" fill="none"/>` +
  `<ellipse cx="46" cy="26.5" rx="5" ry="2" fill="#fff" opacity=".12"/>` +
  `<rect x="31" y="29" width="38" height="3.4" fill="#3a2414"/>` +
  both(`<circle cx="42" cy="30.6" r="5.4" fill="#7fb0ff" stroke="${GOLD}" stroke-width="1.6"/><path d="M39.5 28.6Q41 27.4 42.6 27.6" stroke="#fff" stroke-width="1" fill="none"/>`) +
  `<rect x="47.4" y="29.6" width="5.2" height="2.2" fill="${GOLD}"/>` +
  eyes('#2a1a10', INK, ROOK_SKIN.base, { lid: 2 }) +
  `<path d="M38.5 41.2L47.5 40.2M52.5 40.2L61.5 41.6" stroke="#4c4656" stroke-width="2.2" stroke-linecap="round"/>` +
  `<path d="M58.5 37.5L56 53" stroke="#c9786a" stroke-width="1.2" stroke-linecap="round"/><path d="M56.3 42.5L58.6 43.2M55.8 46.5L58 47.1" stroke="#c9786a" stroke-width=".7"/>`;

const DUARTE_SKIN: Skin = { base: '#c88d5f', shade: '#a6704a', line: '#5e3418' };
const ORANGE = SUSPECT_COLOR.duarte;
const LINEN = '#f4efe7';

const duarte =
  backdrop('#2a1745', ORANGE) +
  `<path d="M14 66C10 58 18 54 14 46M86 62C90 54 82 50 86 42M20 40C17 34 23 31 20 25" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".12"/>` +
  shoulders(LINEN, '#cfc5b8') +
  both('<circle cx="43" cy="88" r="1.5" fill="#b9ab98"/><circle cx="43" cy="96" r="1.5" fill="#b9ab98"/>') +
  `<path d="M38 76L50 86 62 76" stroke="#d6cbbd" stroke-width="1.4" fill="none"/>` +
  neck(DUARTE_SKIN) +
  `<path d="M38 71Q50 79 62 71L62 77Q50 84 38 77Z" fill="${ORANGE}"/>` +
  `<path d="M46 78H54L50 92Z" fill="${ORANGE}"/><path d="M50 78L54 78 50 92Z" fill="#c2421d" opacity=".55"/><circle cx="50" cy="79" r="2.6" fill="#d9502a"/>` +
  head(DUARTE_SKIN) +
  both(`<path d="M34 34V48L36.5 50V36Z" fill="#1d1218"/>`) +
  `<path d="M33 37C25 34 25 18 35 18C34 9 44 5 50 11C56 5 66 9 65 18C75 18 75 34 67 37Q50 32 33 37Z" fill="${LINEN}"/>` +
  `<path d="M42 33V18M50 32V14M58 33V18" stroke="#d6cbbd" stroke-width="1.3" stroke-linecap="round"/>` +
  `<path d="M35 18C35 14 38 12 41 12" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M33 36Q50 31.5 67 36V41Q50 36.5 33 41Z" fill="#e6ddd0"/>` +
  `<path d="M38.5 41Q43 37 47.5 40.2" stroke="#1d1218" stroke-width="2.3" fill="none" stroke-linecap="round"/>` +
  `<path d="M52.5 41.4Q57 40.6 61.5 42.6" stroke="#1d1218" stroke-width="2.3" fill="none" stroke-linecap="round"/>` +
  eyes('#3a2010', INK, DUARTE_SKIN.base, { dx: -0.6, lid: 1 }) +
  `<path d="M50 56C46 54 42 55 40 58C38.5 60 36.5 59.8 35.5 58C36 62.5 41 62.5 44 59.5C46 58.4 48 58.2 50 58.3C52 58.2 54 58.4 56 59.5C59 62.5 64 62.5 64.5 58C63.5 59.8 61.5 60 60 58C58 55 54 54 50 56Z" fill="#1d1218"/>` +
  `<path d="M45.5 62Q50 63.4 55.5 60.6" stroke="${DUARTE_SKIN.line}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;

const THORNE_SKIN: Skin = { base: '#f2d0b5', shade: '#d9ab8c', line: '#9a5f45' };
const VIOLET = SUSPECT_COLOR.thorne;

function wildHair(rx: number, ry: number, cy: number, fill: string): string {
  const points: string[] = [];
  const count = 17;
  for (let i = 0; i <= count; i++) {
    const a = ((150 + (240 * i) / count) * Math.PI) / 180;
    const k = i % 2 === 0 ? 1 : 0.78;
    points.push(`${(50 + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`);
  }
  return `<path d="M${points.join('L')}Z" fill="${fill}" stroke="${fill}" stroke-width="3" stroke-linejoin="round"/>`;
}

const thorne =
  backdrop('#1d1030', VIOLET) +
  `<path d="M12 30L18 36 14 38 21 46M86 22L80 29 85 31 78 40" stroke="${GOLD_LIGHT}" stroke-width="1.4" fill="none" stroke-linejoin="round" opacity=".75"/>` +
  wildHair(27, 23, 40, '#b9a6e6') +
  wildHair(23, 20, 40, '#ece6f8') +
  shoulders('#e8e4ef', '#bdb5cc') +
  `<path d="M37 76L50 100 63 76Z" fill="${VIOLET}"/><path d="M44 76L50 88 56 76Z" fill="#fbf8ff"/>` +
  `<path d="M37 76L50 100 42 100 32 80ZM63 76L50 100 58 100 68 80Z" fill="#d5cfe0"/>` +
  `<circle cx="27" cy="88" r="3" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="1.4 1"/>` +
  neck(THORNE_SKIN) +
  `<path d="M50 78L44 75V81ZM50 78L56 75V81Z" fill="#4b2a8a"/><circle cx="50" cy="78" r="1.4" fill="#6a3fc0"/>` +
  head(THORNE_SKIN) +
  `<path d="M34 40C34 30 40 25 50 25S66 30 66 40C62 34 58 36 54 32C51 35 46 33 44 35C40 33 37 37 34 40Z" fill="#ece6f8"/>` +
  `<rect x="32" y="31" width="36" height="3" fill="#2a1a33"/>` +
  both(`<circle cx="42" cy="32" r="6" fill="${VIOLET}" stroke="${GOLD}" stroke-width="1.8"/><circle cx="42" cy="32" r="3.6" fill="#cdb8ff" opacity=".45"/><path d="M39 29.6Q40.5 28.2 42.4 28.4" stroke="#fff" stroke-width="1" fill="none"/>`) +
  `<rect x="47" y="31" width="6" height="2.4" fill="${GOLD}"/>` +
  `<path d="M38.5 40Q43 36.2 47.5 38.8M52.5 38.8Q57 36.2 61.5 40" stroke="#bcaee0" stroke-width="1.7" fill="none" stroke-linecap="round"/>` +
  [
    [39, 52],
    [41.5, 54],
    [38, 54.8],
    [61, 52],
    [58.5, 54],
    [62, 54.8],
  ]
    .map(([x = 0, y = 0]) => `<circle cx="${x}" cy="${y}" r=".6" fill="#b86a4a" opacity=".7"/>`)
    .join('') +
  both(`<ellipse cx="43" cy="47" rx="3.9" ry="3.1" fill="#fbf6ff"/>`) +
  both('<circle cx="43" cy="47" r="1.4" fill="#4b2a8a"/><circle cx="43" cy="47" r=".7" fill="#120a1f"/><circle cx="43.5" cy="46.4" r=".45" fill="#fff"/>') +
  both(`<path d="M39 46Q43 43 47 46" stroke="${THORNE_SKIN.line}" stroke-width="1" fill="none" stroke-linecap="round"/>`) +
  `<path d="M42.5 57.5Q50 66 57.5 57.5Q50 60.5 42.5 57.5Z" fill="#4a1630"/><path d="M43.6 58.2Q50 60.6 56.4 58.2L55.6 59.6Q50 61.4 44.4 59.6Z" fill="#fff"/>`;

/** Inner markup for each suspect, built once. */
export const PORTRAITS: Readonly<Record<SuspectId, string>> = { vesper, finch, juniper, rook, duarte, thorne };
