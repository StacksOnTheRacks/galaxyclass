import type { Theme } from './types.js';

export const halloweenTheme: Theme = {
  id: 'halloween',
  name: 'Halloween',
  board: {
    frame: '#2b1631',
    frameEdge: '#160a1a',
    square: '#efe2cc',
    grid: '#cdb894',
    centerGlyph: 'moon',
    centerColor: '#e8742a',
    premiums: {
      DL: { fill: '#f6c48a', text: '#5b2c06' },
      TL: { fill: '#e06a1c', text: '#fff4e8' },
      DW: { fill: '#a6c76a', text: '#2c3d12' },
      TW: { fill: '#6c3ea3', text: '#f6eeff' },
    },
  },
  room: {
    skyTop: '#140a1e',
    skyBottom: '#3d1c3e',
    floor: '#1c0f20',
    decorations: [
      { shape: 'dot', color: '#c9b6d9', count: 40, size: [1, 2.5], band: 0.6, drift: 0 },
      { shape: 'moon', color: '#f7e3a1', count: 1, size: [70, 70], band: 0.3, drift: 0 },
      { shape: 'bat', color: '#0b050e', count: 7, size: [22, 40], band: 0.5, drift: -6 },
      { shape: 'leaf', color: '#c4561c', count: 10, size: [10, 18], band: 1, drift: 14 },
    ],
  },
  emphasis: {
    highlight: '#ff8a1f',
    glow: '#ffd27a',
    countText: '#fff1df',
    countStroke: '#2b1631',
    premiumFlash: '#ffe0a3',
    burst: 'ember',
  },
};
