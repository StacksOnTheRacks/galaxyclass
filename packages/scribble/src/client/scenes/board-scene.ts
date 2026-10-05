import * as Phaser from 'phaser';
import { squareKey } from '../../rules/board.js';
import { hexToNumber } from '../../themes/index.js';
import type { BurstStyle } from '../../themes/types.js';
import { BOARD_PX, CELL, cellCenter, cellOrigin } from '../layout.js';
import type { TableModel } from '../model.js';
import type { TimelineStep } from '../score-timeline.js';
import { BOARD_TEX_SCALE, BODY_FONT, LETTER_FONT, paintBoard } from './paint.js';
import { tileTexture } from './tile-textures.js';

const TILE_DISPLAY = CELL - 4;
const DRAFT_RING = 0x3b82f6;
const DRAFT_RING_VALID = 0x22c55e;
const DRAFT_RING_INVALID = 0xef4444;

/** The board under its own zoomable camera: squares, committed tiles, the draft, and count effects. */
export class BoardScene extends Phaser.Scene {
  private boardImage: Phaser.GameObjects.Image | null = null;
  private committed = new Map<string, Phaser.GameObjects.Image>();
  private draftLayer!: Phaser.GameObjects.Container;
  private target!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  /** Sits under the tiles of the most recent play, so it is easy to spot after the count fades. */
  private lastPlay!: Phaser.GameObjects.Graphics;
  private highlightCells: Array<{ row: number; col: number }> = [];
  private highlightFade: Phaser.Time.TimerEvent | null = null;
  private unsubscribe: Array<() => void> = [];

  constructor(private readonly model: TableModel) {
    super({ key: 'board', active: true });
  }

  create(): void {
    this.drawBoard();
    this.lastPlay = this.add.graphics().setDepth(0.5);
    this.highlight = this.add.graphics().setDepth(2);
    this.draftLayer = this.add.container(0, 0).setDepth(3);
    this.target = this.add.graphics().setDepth(4);
    this.syncCamera();
    this.drawCommitted();
    this.drawLastPlay();
    this.drawDraft();

    this.unsubscribe.push(
      this.model.on((kind) => {
        if (kind === 'theme') {
          this.drawBoard();
          this.paintHighlight();
          this.drawLastPlay();
        } else if (kind === 'layout' || kind === 'camera') {
          this.syncCamera();
        } else if (kind === 'snapshot') {
          this.drawCommitted();
          this.drawLastPlay();
        } else if (kind === 'draft' || kind === 'preview') {
          this.drawDraft();
        } else if (kind === 'drag') {
          this.drawTarget();
        }
      }),
      this.model.onBeat((step) => this.onBeat(step)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach((off) => off()));
  }

  private syncCamera(): void {
    const { board } = this.model.layout;
    const camera = this.cameras.main;
    camera.setViewport(board.x, board.y, board.width, board.height);
    camera.setOrigin(0, 0);
    camera.setZoom(this.model.camera.zoom);
    camera.setScroll(this.model.camera.scrollX, this.model.camera.scrollY);
  }

  private drawBoard(): void {
    const theme = this.model.theme;
    const key = `board-${theme.id}`;
    if (!this.textures.exists(key)) {
      const size = Math.ceil(BOARD_PX * BOARD_TEX_SCALE);
      const texture = this.textures.createCanvas(key, size, size)!;
      paintBoard(texture.getContext(), theme);
      texture.refresh();
    }
    if (this.boardImage) {
      this.boardImage.setTexture(key);
    } else {
      this.boardImage = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
    }
    this.boardImage.setDisplaySize(BOARD_PX, BOARD_PX);
  }

  private drawCommitted(): void {
    const board = this.model.snapshot?.board ?? [];
    const seen = new Set<string>();
    for (const tile of board) {
      const key = squareKey(tile.row, tile.col);
      seen.add(key);
      const textureKey = tileTexture(this.textures, tile.letter, tile.blank);
      const existing = this.committed.get(key);
      if (existing) {
        existing.setTexture(textureKey);
        continue;
      }
      const center = cellCenter(tile.row, tile.col);
      const image = this.add.image(center.x, center.y, textureKey).setDisplaySize(TILE_DISPLAY, TILE_DISPLAY).setDepth(1);
      this.committed.set(key, image);
    }
    for (const [key, image] of this.committed) {
      if (!seen.has(key)) {
        image.destroy();
        this.committed.delete(key);
      }
    }
  }

  private drawLastPlay(): void {
    this.lastPlay.clear();
    const turn = this.model.snapshot?.lastTurn;
    if (!turn || turn.kind !== 'play') {
      return;
    }
    const { emphasis } = this.model.theme;
    this.lastPlay.fillStyle(hexToNumber(emphasis.highlight), 0.95);
    for (const cell of turn.placed) {
      const origin = cellOrigin(cell.row, cell.col);
      this.lastPlay.fillRoundedRect(origin.x, origin.y, CELL, CELL, 8);
    }
  }

  private draftRingColor(): number {
    const { state } = this.model.verdict;
    if (state === 'valid') {
      return DRAFT_RING_VALID;
    }
    return state === 'rejected' || state === 'placement' ? DRAFT_RING_INVALID : DRAFT_RING;
  }

  private drawDraft(): void {
    this.draftLayer.removeAll(true);
    const byId = new Map(this.model.rack.map((tile) => [tile.id, tile]));
    const ringColor = this.draftRingColor();
    for (const [tileId, spot] of Object.entries(this.model.draft.placed)) {
      const tile = byId.get(tileId);
      if (!tile) {
        continue;
      }
      const letter = tile.letter ?? spot.letter;
      const center = cellCenter(spot.row, spot.col);
      const ring = this.add.graphics();
      ring.lineStyle(3, ringColor, 1);
      const origin = cellOrigin(spot.row, spot.col);
      ring.strokeRoundedRect(origin.x + 1, origin.y + 1, CELL - 2, CELL - 2, 7);
      const image = this.add
        .image(center.x, center.y - 2, tileTexture(this.textures, letter, tile.letter === null))
        .setDisplaySize(TILE_DISPLAY, TILE_DISPLAY);
      this.draftLayer.add([image, ring]);
    }
  }

  private drawTarget(): void {
    this.target.clear();
    const cell = this.model.drag?.target;
    if (!cell) {
      return;
    }
    const origin = cellOrigin(cell.row, cell.col);
    this.target.fillStyle(DRAFT_RING, 0.25);
    this.target.fillRoundedRect(origin.x, origin.y, CELL, CELL, 7);
    this.target.lineStyle(2, DRAFT_RING, 0.9);
    this.target.strokeRoundedRect(origin.x, origin.y, CELL, CELL, 7);
  }

  private paintHighlight(): void {
    const { emphasis } = this.model.theme;
    this.highlight.clear();
    for (const cell of this.highlightCells) {
      const origin = cellOrigin(cell.row, cell.col);
      this.highlight.fillStyle(hexToNumber(emphasis.glow), 0.55);
      this.highlight.fillRoundedRect(origin.x - 3, origin.y - 3, CELL + 6, CELL + 6, 9);
      this.highlight.lineStyle(3, hexToNumber(emphasis.highlight), 1);
      this.highlight.strokeRoundedRect(origin.x - 2, origin.y - 2, CELL + 4, CELL + 4, 9);
    }
  }

  private get reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  private onBeat(step: TimelineStep): void {
    switch (step.kind) {
      case 'highlight':
        this.highlightFade?.remove();
        this.tweens.killTweensOf(this.highlight);
        this.highlight.setAlpha(1);
        this.highlightCells = step.cells;
        this.paintHighlight();
        break;
      case 'tile':
        this.pulse(step.row, step.col, 1.12);
        this.floatLabel(step.row, step.col, step.label, this.model.theme.emphasis.countText, 16);
        break;
      case 'premium':
        this.flashPremium(step.row, step.col, step.premium);
        this.floatLabel(step.row, step.col, step.label, this.model.theme.emphasis.highlight, 15);
        break;
      case 'bingo': {
        const cells = this.highlightCells;
        const mid = cells[Math.floor(cells.length / 2)] ?? { row: 7, col: 7 };
        this.burst(mid.row, mid.col, 26, 90);
        break;
      }
      case 'total':
        this.highlightFade = this.time.delayedCall(1400, () => {
          this.tweens.add({
            targets: this.highlight,
            alpha: 0,
            duration: 500,
            onComplete: () => {
              this.highlightCells = [];
              this.highlight.clear();
              this.highlight.setAlpha(1);
            },
          });
        });
        break;
      default:
        break;
    }
  }

  private pulse(row: number, col: number, scale: number): void {
    const image = this.committed.get(squareKey(row, col));
    if (!image || this.reducedMotion) {
      return;
    }
    const base = TILE_DISPLAY / image.width;
    this.tweens.killTweensOf(image);
    image.setScale(base);
    this.tweens.add({ targets: image, scale: base * scale, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  private flashPremium(row: number, col: number, premium: 'DL' | 'TL' | 'DW' | 'TW'): void {
    const theme = this.model.theme;
    const center = cellCenter(row, col);
    const fill = hexToNumber(theme.board.premiums[premium].fill);
    const flash = this.add.rectangle(center.x, center.y, CELL, CELL, fill, 0.95).setDepth(5);
    flash.setStrokeStyle(3, hexToNumber(theme.emphasis.premiumFlash), 1);
    this.tweens.add({
      targets: flash,
      scale: this.reducedMotion ? 1 : premium.endsWith('W') ? 2.1 : 1.6,
      alpha: 0,
      duration: 560,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.pulse(row, col, premium.endsWith('W') ? 1.25 : 1.18);
    if (!this.reducedMotion) {
      this.burst(row, col, premium.endsWith('W') ? 14 : 8, premium.endsWith('W') ? 60 : 40);
    }
  }

  private burst(row: number, col: number, count: number, reach: number): void {
    if (this.reducedMotion) {
      return;
    }
    const theme = this.model.theme;
    const center = cellCenter(row, col);
    const style: BurstStyle = theme.emphasis.burst;
    const colors = [hexToNumber(theme.emphasis.highlight), hexToNumber(theme.emphasis.glow)];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = reach * (0.6 + Math.random() * 0.5);
      const size = style === 'snow' ? 3 + Math.random() * 3 : 2 + Math.random() * 3;
      const piece =
        style === 'sparkle'
          ? this.add.star(center.x, center.y, 4, size * 0.4, size * 1.4, colors[i % 2]!)
          : this.add.circle(center.x, center.y, size, style === 'snow' ? 0xffffff : colors[i % 2]!);
      piece.setDepth(6);
      this.tweens.add({
        targets: piece,
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance + (style === 'snow' ? 18 : style === 'ember' ? -18 : 0),
        alpha: 0,
        angle: style === 'sparkle' ? 180 : 0,
        duration: 650 + Math.random() * 250,
        ease: 'Quad.easeOut',
        onComplete: () => piece.destroy(),
      });
    }
  }

  private floatLabel(row: number, col: number, label: string, color: string, size: number): void {
    const center = cellCenter(row, col);
    const text = this.add
      .text(center.x, center.y - CELL * 0.55, label, {
        fontFamily: label.startsWith('+') ? LETTER_FONT : BODY_FONT,
        fontSize: `${size}px`,
        fontStyle: '800',
        color,
        stroke: this.model.theme.emphasis.countStroke,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(7)
      .setResolution(Math.max(2, window.devicePixelRatio * 2));
    this.tweens.add({
      targets: text,
      y: text.y - (this.reducedMotion ? 0 : 22),
      alpha: 0,
      delay: 220,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }
}
