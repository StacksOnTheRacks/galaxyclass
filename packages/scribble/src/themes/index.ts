import { christmasTheme } from './christmas.js';
import { defaultTheme } from './default.js';
import { halloweenTheme } from './halloween.js';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from './ids.js';
import type { Theme } from './types.js';

export const THEMES: Record<ThemeId, Theme> = {
  default: defaultTheme,
  halloween: halloweenTheme,
  christmas: christmasTheme,
};

export function themeFor(id: unknown): Theme {
  return THEMES[isThemeId(id) ? id : DEFAULT_THEME_ID];
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

export type { Theme } from './types.js';
