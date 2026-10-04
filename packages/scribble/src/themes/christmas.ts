import type { Theme } from './types.js';

export const christmasTheme: Theme = {
  id: 'christmas',
  name: 'Christmas',
  board: {
    frame: '#7c2230',
    frameEdge: '#4c121c',
    square: '#fbf6ec',
    grid: '#e3d6bd',
    centerGlyph: 'snowflake',
    centerColor: '#2f7d5b',
    premiums: {
      DL: { fill: '#c3e3d3', text: '#1d4a36' },
      TL: { fill: '#2f7d5b', text: '#f2fff8' },
      DW: { fill: '#f0c96b', text: '#5b4210' },
      TW: { fill: '#b8323f', text: '#fff2f3' },
    },
  },
  room: {
    skyTop: '#0d2a24',
    skyBottom: '#1f4b3b',
    floor: '#e9efe9',
    decorations: [
      { shape: 'snowflake', color: '#ffffff', count: 28, size: [6, 16], band: 1, drift: 18 },
      { shape: 'tree', color: '#174d33', count: 5, size: [90, 150], band: 1, drift: 0 },
      { shape: 'ornament', color: '#e2b13c', count: 8, size: [10, 16], band: 0.45, drift: 0 },
    ],
  },
  emphasis: {
    highlight: '#f0c96b',
    glow: '#fff6d2',
    countText: '#ffffff',
    countStroke: '#4c121c',
    premiumFlash: '#fff6d2',
    burst: 'snow',
  },
};
