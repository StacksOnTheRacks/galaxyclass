import type { WeaponId } from '../../rules/types.js';

/**
 * Weapon icons in a 0 0 64 64 box, transparent behind. A dark outline keeps each silhouette
 * readable at token size on any ground.
 */

const INK = '#120a1f';
const GOLD = '#d9a441';
const GOLD_LIGHT = '#f5c96b';
const GOLD_DARK = '#9a6a1c';
const PINK = '#ff4fa3';
const LINE = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;

const telescope =
  `<path d="M30 40L18 60M30 40L32 61M30 40L45 59" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/>` +
  `<path d="M30 40L18 60M30 40L32 61M30 40L45 59" stroke="#6b4a36" stroke-width="2" stroke-linecap="round"/>` +
  `<g transform="rotate(-34 32 32)">` +
  `<rect x="2" y="28.5" width="12" height="7" rx="1.5" fill="${GOLD}" ${LINE}/>` +
  `<rect x="13" y="26.5" width="16" height="11" rx="1.5" fill="${GOLD}" ${LINE}/>` +
  `<rect x="28" y="24" width="27" height="16" rx="2" fill="${GOLD}" ${LINE}/>` +
  `<rect x="53" y="22" width="7" height="20" rx="2" fill="${GOLD_DARK}" ${LINE}/>` +
  `<path d="M4 30H12M15 28.5H27M30 26.5H52" stroke="${GOLD_LIGHT}" stroke-width="2" stroke-linecap="round"/>` +
  `<path d="M36 24V40M46 24V40" stroke="${GOLD_DARK}" stroke-width="2"/>` +
  `<ellipse cx="60" cy="32" rx="1.6" ry="7" fill="#7fd0ff"/></g>` +
  `<circle cx="30" cy="40" r="3.2" fill="${GOLD_DARK}" ${LINE}/>`;

const vial =
  `<rect x="25" y="4" width="14" height="8" rx="2" fill="#b07a45" ${LINE}/>` +
  `<path d="M27 6H37" stroke="#d9a46a" stroke-width="1.6" stroke-linecap="round"/>` +
  `<path d="M27 12H37V25A17 17 0 1 1 27 25Z" fill="#d8e6ff" fill-opacity=".22" ${LINE}/>` +
  `<path d="M17.4 37A15 15 0 1 0 46.6 37Z" fill="#5dff9a"/>` +
  `<ellipse cx="32" cy="37" rx="14.6" ry="2.4" fill="#b8ffd2"/>` +
  `<path d="M27 12H37V25A17 17 0 1 1 27 25Z" fill="none" ${LINE}/>` +
  `<circle cx="32" cy="46" r="5.4" fill="${INK}" opacity=".85"/><path d="M28.6 49.6H35.4V53H28.6Z" fill="${INK}" opacity=".85"/>` +
  `<circle cx="30" cy="45.6" r="1.6" fill="#5dff9a"/><circle cx="34" cy="45.6" r="1.6" fill="#5dff9a"/>` +
  `<path d="M30.4 51V53M32 51V53M33.6 51V53" stroke="#5dff9a" stroke-width=".8"/>` +
  `<circle cx="40" cy="41" r="1.6" fill="#e8fff0"/><circle cx="24" cy="44" r="1.1" fill="#e8fff0"/><circle cx="33" cy="22" r="1.3" fill="#5dff9a" opacity=".8"/>` +
  `<path d="M20 34A13 13 0 0 1 26.5 26.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>`;

const saber =
  `<path d="M19 45C31 36 45 22 58 5C51 22 38 38 24 50Z" fill="#e4e8f3" ${LINE}/>` +
  `<path d="M21.5 47.5C33 38 46 23 58 5" stroke="#9aa3ba" stroke-width="1.4" fill="none"/>` +
  `<path d="M26 44C36 35 46 24 54 13" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
  `<path d="M12 56L22 46" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/>` +
  `<path d="M12 56L22 46" stroke="#3a2252" stroke-width="4.6" stroke-linecap="round"/>` +
  `<path d="M13.5 52.5L16 55M16 50L18.5 52.5M18.5 47.5L21 50" stroke="${GOLD_LIGHT}" stroke-width="1.2"/>` +
  `<path d="M13 39L29 55" stroke="${INK}" stroke-width="6.4" stroke-linecap="round"/>` +
  `<path d="M13 39L29 55" stroke="${GOLD}" stroke-width="3.6" stroke-linecap="round"/>` +
  `<path d="M14 40L27 53" stroke="${GOLD_LIGHT}" stroke-width="1.2" stroke-linecap="round"/>` +
  `<path d="M28.5 54C24 60 16 62 10 58" stroke="${INK}" stroke-width="4.4" fill="none" stroke-linecap="round"/>` +
  `<path d="M28.5 54C24 60 16 62 10 58" stroke="${GOLD}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  `<circle cx="9.5" cy="58.5" r="4" fill="${GOLD}" ${LINE}/>` +
  `<path d="M8 61L5 64M10 62L9 64M6.5 59.5L3 62" stroke="${PINK}" stroke-width="2" stroke-linecap="round"/>`;

const raygun =
  `<path d="M22 34H31L27 56H15Z" fill="#4a2a6e" ${LINE}/>` +
  `<path d="M19 39H26M18 44H25M17 49H24" stroke="#6c48a0" stroke-width="1.6"/>` +
  `<path d="M28 36Q32 44 26 46" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  `<path d="M15 20L7 8 26 17Z" fill="#3dd6c4" ${LINE}/>` +
  `<path d="M14 34L5 42 20 36Z" fill="#3dd6c4" ${LINE}/>` +
  `<rect x="36" y="22.5" width="17" height="11" rx="2" fill="#cfc9dc" ${LINE}/>` +
  `<path d="M40 22.5V33.5M44.5 22.5V33.5M49 22.5V33.5" stroke="${GOLD}" stroke-width="2.4"/>` +
  `<ellipse cx="25" cy="28" rx="15" ry="10.5" fill="${GOLD}" ${LINE}/>` +
  `<path d="M13 25Q20 18 34 20" stroke="${GOLD_LIGHT}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
  `<circle cx="25" cy="29" r="4.6" fill="#3dd6c4" ${LINE}/><circle cx="23.6" cy="27.6" r="1.4" fill="#fff"/>` +
  `<path d="M52 20L60 15V41L52 36Z" fill="${PINK}" ${LINE}/>` +
  `<path d="M55 21.5V34.5" stroke="#ffc2e0" stroke-width="1.4" stroke-linecap="round"/>`;

const trophy =
  `<path d="M19 14C7 13 7 29 21 31M45 14C57 13 57 29 43 31" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>` +
  `<path d="M19 14C7 13 7 29 21 31M45 14C57 13 57 29 43 31" stroke="${GOLD}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
  `<path d="M16 9H48L45.5 25C43.5 35 38 40 32 40S20.5 35 18.5 25Z" fill="${GOLD}" ${LINE}/>` +
  `<path d="M20.5 12L22 25C23 30 25 33.5 27.5 35.5" stroke="${GOLD_LIGHT}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
  `<path d="M32 15L34 20.2 39.5 20.4 35.2 23.8 36.7 29.2 32 26 27.3 29.2 28.8 23.8 24.5 20.4 30 20.2Z" fill="${GOLD_DARK}"/>` +
  `<path d="M28.5 40H35.5L36.5 48H27.5Z" fill="${GOLD}" ${LINE}/>` +
  `<rect x="20" y="47" width="24" height="5" rx="1.5" fill="${GOLD}" ${LINE}/>` +
  `<rect x="15" y="52" width="34" height="9" rx="2" fill="#2a1745" ${LINE}/>` +
  `<rect x="25" y="54.5" width="14" height="4" rx="1" fill="${GOLD_LIGHT}"/>` +
  `<ellipse cx="32" cy="9" rx="16" ry="2.6" fill="${GOLD_DARK}" ${LINE}/>`;

const MARBLE = '#ece6f4';
const MARBLE_SHADE = '#c4b8d8';

const bust =
  `<path d="M14 48C14 39 21 36 31 36S48 39 48 48Z" fill="${MARBLE}" ${LINE}/>` +
  `<path d="M38 37C44 39 48 42 48 48H40C40 44 40 40 38 37Z" fill="${MARBLE_SHADE}"/>` +
  `<path d="M27 28H37L38 37C34 39 30 39 26 37Z" fill="${MARBLE}" ${LINE}/>` +
  `<path d="M23 21C21 11 27 4 35 4S48 10 47 19C46.5 25 44 30 39 31.5L30.5 32C28.5 31 27.5 29.5 27.5 28L25 27.5C24 27 24.3 25.6 25 25.2L23.6 24.6 21.2 23.2Z" fill="${MARBLE}" ${LINE}/>` +
  `<path d="M33 5C42 3 50 11 46 20C43.5 23 41 23 39 21C41 16 39 11 33 10Z" fill="${MARBLE_SHADE}"/>` +
  [
    [36, 8],
    [42, 9],
    [45, 14],
    [44, 20],
    [40, 24],
  ]
    .map(([x = 0, y = 0]) => `<circle cx="${x}" cy="${y}" r="3.3" fill="${MARBLE}" stroke="${MARBLE_SHADE}" stroke-width="1.1"/>`)
    .join('') +
  `<path d="M25 15.5Q28 14 31 15.5" stroke="#8e80a8" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
  `<path d="M24.5 19Q27 18.4 29 19.6" stroke="#8e80a8" stroke-width="1" fill="none" stroke-linecap="round"/>` +
  `<path d="M18 44Q24 40 30 43M40 40Q36 44 38 47" stroke="#b3a6cc" stroke-width=".8" fill="none"/>` +
  `<rect x="12" y="48" width="38" height="5" rx="1" fill="${MARBLE}" ${LINE}/>` +
  `<rect x="16" y="53" width="30" height="8" rx="1" fill="#2a1745" ${LINE}/>` +
  `<path d="M20 57H42" stroke="${GOLD}" stroke-width="1.6"/>`;

/** Inner markup for each weapon, built once. */
export const WEAPON_ICONS: Readonly<Record<WeaponId, string>> = { telescope, vial, saber, raygun, trophy, bust };
