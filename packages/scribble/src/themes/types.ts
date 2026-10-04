import type { Premium } from '../rules/types.js';
import type { ThemeId } from './ids.js';

/** `#rrggbb`. */
export type Hex = string;

export type DecorationShape = 'dot' | 'star' | 'moon' | 'bat' | 'leaf' | 'snowflake' | 'tree' | 'ornament';
export type CenterGlyph = 'compass' | 'moon' | 'snowflake';
export type BurstStyle = 'sparkle' | 'ember' | 'snow';

export interface Decoration {
  shape: DecorationShape;
  color: Hex;
  count: number;
  /** Pixel size range at a 1000px-tall room. */
  size: [number, number];
  /** Fraction of the room height the shapes stay above (0 = anywhere, 0.6 = top 60%). */
  band: number;
  /** Vertical drift in px per second; 0 holds still. */
  drift: number;
}

/**
 * A theme only changes three things: board accents, the room behind the board, and how a
 * scored word is emphasised. Tiles, rack, and controls look the same under every theme.
 */
export interface Theme {
  id: ThemeId;
  name: string;
  board: {
    frame: Hex;
    frameEdge: Hex;
    square: Hex;
    grid: Hex;
    centerGlyph: CenterGlyph;
    centerColor: Hex;
    premiums: Record<Premium, { fill: Hex; text: Hex }>;
  };
  room: {
    skyTop: Hex;
    skyBottom: Hex;
    floor: Hex;
    decorations: Decoration[];
  };
  emphasis: {
    highlight: Hex;
    glow: Hex;
    countText: Hex;
    countStroke: Hex;
    premiumFlash: Hex;
    burst: BurstStyle;
  };
}
