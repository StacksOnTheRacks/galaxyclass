import type { Theme } from './types.js';

export const defaultTheme: Theme = {
  id: 'default',
  name: 'Study',
  board: {
    frame: '#2c4a63',
    frameEdge: '#1b3044',
    square: '#f4ecdc',
    grid: '#d9ccb3',
    centerGlyph: 'compass',
    centerColor: '#b4893a',
    premiums: {
      DL: { fill: '#b9d4a8', text: '#2f4a25' },
      TL: { fill: '#3f8f86', text: '#f4fbf9' },
      DW: { fill: '#ecc871', text: '#5a4210' },
      TW: { fill: '#8c5aa6', text: '#fbf3ff' },
    },
  },
  room: {
    skyTop: '#0f1d33',
    skyBottom: '#24425f',
    floor: '#162a3f',
    decorations: [
      { shape: 'dot', color: '#dfe8f5', count: 70, size: [1.5, 3], band: 0.7, drift: 0 },
      { shape: 'star', color: '#f3d98b', count: 9, size: [8, 16], band: 0.55, drift: 0 },
    ],
  },
  emphasis: {
    highlight: '#f2c94c',
    glow: '#fff1b8',
    countText: '#fffaf0',
    countStroke: '#1b3044',
    premiumFlash: '#ffffff',
    burst: 'sparkle',
  },
};
