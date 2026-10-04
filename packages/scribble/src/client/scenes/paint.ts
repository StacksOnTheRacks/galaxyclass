import { BOARD_SIZE, CENTER, premiumAt } from '../../rules/board.js';
import type { CenterGlyph, DecorationShape, Theme } from '../../themes/types.js';
import { CELL, FRAME, BOARD_PX } from '../layout.js';

/** Tile textures are painted at this many pixels per side and scaled down for display. */
export const TILE_TEX = 128;
/** Board texture pixels per world unit, so the board stays sharp when zoomed in. */
export const BOARD_TEX_SCALE = 2.5;

export const LETTER_FONT = '"Poppins", "Inter", system-ui, sans-serif';
export const BODY_FONT = '"Inter", system-ui, sans-serif';

const TILE_COLORS = {
  faceTop: '#fbf2de',
  faceBottom: '#efdbb3',
  edge: '#b48e55',
  shade: '#c9a46c',
  letter: '#2a2016',
  value: '#5a4630',
  blankLetter: '#a3522a',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One tile face. `letter` null paints an unassigned blank; `blank` paints a chosen blank letter. */
export function paintTile(ctx: CanvasRenderingContext2D, letter: string | null, value: number, blank: boolean): void {
  const s = TILE_TEX;
  ctx.clearRect(0, 0, s, s);
  const inset = s * 0.04;
  const size = s - inset * 2;
  const radius = s * 0.13;

  ctx.fillStyle = TILE_COLORS.shade;
  roundRect(ctx, inset, inset + s * 0.035, size, size - s * 0.02, radius);
  ctx.fill();

  const gradient = ctx.createLinearGradient(0, inset, 0, inset + size);
  gradient.addColorStop(0, TILE_COLORS.faceTop);
  gradient.addColorStop(1, TILE_COLORS.faceBottom);
  ctx.fillStyle = gradient;
  roundRect(ctx, inset, inset, size, size - s * 0.04, radius);
  ctx.fill();
  ctx.lineWidth = s * 0.02;
  ctx.strokeStyle = TILE_COLORS.edge;
  ctx.stroke();

  if (letter) {
    ctx.fillStyle = blank ? TILE_COLORS.blankLetter : TILE_COLORS.letter;
    ctx.font = `800 ${Math.round(s * 0.52)}px ${LETTER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s * (blank ? 0.5 : 0.46), s * 0.5);
  }
  if (letter && !blank) {
    ctx.fillStyle = TILE_COLORS.value;
    ctx.font = `700 ${Math.round(s * 0.2)}px ${BODY_FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(value), s * 0.86, s * 0.84);
  }
  if (!letter) {
    ctx.strokeStyle = TILE_COLORS.shade;
    ctx.lineWidth = s * 0.025;
    ctx.setLineDash([s * 0.05, s * 0.05]);
    roundRect(ctx, s * 0.24, s * 0.24, s * 0.52, s * 0.48, s * 0.08);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

const PREMIUM_LABEL = { DL: ['2×', 'letter'], TL: ['3×', 'letter'], DW: ['2×', 'word'], TW: ['3×', 'word'] } as const;

function glyph(ctx: CanvasRenderingContext2D, kind: CenterGlyph, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'compass') {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI / 8) * i - Math.PI / 2;
      const radius = i % 4 === 0 ? r : i % 2 === 0 ? r * 0.55 : r * 0.28;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'moon') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(r * 0.38, -r * 0.22, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -r * 0.9);
      ctx.moveTo(0, -r * 0.55);
      ctx.lineTo(r * 0.22, -r * 0.75);
      ctx.moveTo(0, -r * 0.55);
      ctx.lineTo(-r * 0.22, -r * 0.75);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The whole board for a theme: frame, squares, premium squares, and the centre mark. */
export function paintBoard(ctx: CanvasRenderingContext2D, theme: Theme): void {
  const k = BOARD_TEX_SCALE;
  const { board } = theme;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);

  ctx.fillStyle = board.frameEdge;
  roundRect(ctx, 0, 0, BOARD_PX, BOARD_PX, 16);
  ctx.fill();
  ctx.fillStyle = board.frame;
  roundRect(ctx, 3, 3, BOARD_PX - 6, BOARD_PX - 6, 14);
  ctx.fill();
  ctx.fillStyle = board.grid;
  ctx.fillRect(FRAME - 2, FRAME - 2, BOARD_SIZE * CELL + 4, BOARD_SIZE * CELL + 4);

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const x = FRAME + col * CELL;
      const y = FRAME + row * CELL;
      const premium = premiumAt(row, col);
      ctx.fillStyle = premium ? board.premiums[premium].fill : board.square;
      roundRect(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 6);
      ctx.fill();
      if (row === CENTER && col === CENTER) {
        glyph(ctx, board.centerGlyph, x + CELL / 2, y + CELL / 2, CELL * 0.36, board.centerColor);
      } else if (premium) {
        const [big, small] = PREMIUM_LABEL[premium];
        ctx.fillStyle = board.premiums[premium].text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 15px ${LETTER_FONT}`;
        ctx.fillText(big, x + CELL / 2, y + CELL * 0.4);
        ctx.font = `600 9px ${BODY_FONT}`;
        ctx.fillText(small, x + CELL / 2, y + CELL * 0.7);
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Decoration sprites, painted white-on-transparent in the given colour at `size` pixels. */
export function paintDecoration(ctx: CanvasRenderingContext2D, shape: DecorationShape, color: string, size: number): void {
  const s = size;
  const c = s / 2;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (shape) {
    case 'dot':
      ctx.beginPath();
      ctx.arc(c, c, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? s * 0.48 : s * 0.2;
        ctx.lineTo(c + Math.cos(angle) * r, c + Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'moon':
      glyph(ctx, 'moon', c, c, s * 0.55, color);
      break;
    case 'bat':
      ctx.beginPath();
      ctx.moveTo(c, s * 0.42);
      ctx.quadraticCurveTo(s * 0.7, s * 0.2, s * 0.98, s * 0.36);
      ctx.quadraticCurveTo(s * 0.86, s * 0.48, s * 0.88, s * 0.62);
      ctx.quadraticCurveTo(s * 0.74, s * 0.52, s * 0.66, s * 0.64);
      ctx.quadraticCurveTo(s * 0.58, s * 0.54, c, s * 0.68);
      ctx.quadraticCurveTo(s * 0.42, s * 0.54, s * 0.34, s * 0.64);
      ctx.quadraticCurveTo(s * 0.26, s * 0.52, s * 0.12, s * 0.62);
      ctx.quadraticCurveTo(s * 0.14, s * 0.48, s * 0.02, s * 0.36);
      ctx.quadraticCurveTo(s * 0.3, s * 0.2, c, s * 0.42);
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(c, s * 0.05);
      ctx.quadraticCurveTo(s * 0.95, s * 0.35, c, s * 0.95);
      ctx.quadraticCurveTo(s * 0.05, s * 0.35, c, s * 0.05);
      ctx.fill();
      break;
    case 'snowflake':
      glyph(ctx, 'snowflake', c, c, s * 0.5, color);
      break;
    case 'tree':
      for (let i = 0; i < 3; i++) {
        const top = s * (0.05 + i * 0.2);
        const half = s * (0.2 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(c, top);
        ctx.lineTo(c + half, top + s * 0.36);
        ctx.lineTo(c - half, top + s * 0.36);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(c - s * 0.05, s * 0.86, s * 0.1, s * 0.14);
      break;
    case 'ornament':
      ctx.beginPath();
      ctx.arc(c, s * 0.58, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(c - s * 0.1, s * 0.1, s * 0.2, s * 0.14);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c - s * 0.12, s * 0.48, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
  }
}

/** Small deterministic generator so decorations keep their places between redraws. */
export function placementRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}
