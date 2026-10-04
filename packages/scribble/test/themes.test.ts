import { describe, expect, it } from 'vitest';
import { THEME_IDS } from '../src/themes/ids.js';
import { THEMES, themeFor } from '../src/themes/index.js';

const HEX = /^#[0-9a-f]{6}$/;

function hexValues(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string' && value.startsWith('#')) {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => hexValues(item, `${path}[${i}]`, out));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      hexValues(inner, `${path}.${key}`, out);
    }
  }
}

describe('themes are data', () => {
  it('ships exactly Default, Halloween, and Christmas', () => {
    expect(Object.keys(THEMES)).toEqual([...THEME_IDS]);
    expect(THEME_IDS).toEqual(['default', 'halloween', 'christmas']);
  });

  it.each(THEME_IDS)('%s changes only board accents, the room, and scored-word emphasis', (id) => {
    const theme = THEMES[id];
    expect(theme.id).toBe(id);
    expect(Object.keys(theme).sort()).toEqual(['board', 'emphasis', 'id', 'name', 'room']);
    expect(Object.keys(theme.board.premiums).sort()).toEqual(['DL', 'DW', 'TL', 'TW']);
    expect(theme.room.decorations.length).toBeGreaterThan(0);
    const colors: Array<[string, string]> = [];
    hexValues(theme, id, colors);
    for (const [path, color] of colors) {
      expect(color, path).toMatch(HEX);
    }
  });

  it('gives each premium a distinct fill so the four squares read apart', () => {
    for (const id of THEME_IDS) {
      const fills = Object.values(THEMES[id].board.premiums).map((p) => p.fill);
      expect(new Set(fills).size).toBe(4);
    }
  });

  it('falls back to Default for an unknown id', () => {
    expect(themeFor('neon').id).toBe('default');
    expect(themeFor('christmas').id).toBe('christmas');
  });
});
