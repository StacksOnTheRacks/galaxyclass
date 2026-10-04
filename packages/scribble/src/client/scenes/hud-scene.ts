import * as Phaser from 'phaser';
import type { TableController } from '../controller.js';
import { rackSlots } from '../layout.js';
import type { TableModel } from '../model.js';
import type { TimelineStep } from '../score-timeline.js';
import { LETTER_FONT, BODY_FONT } from './paint.js';
import { tileTexture } from './tile-textures.js';

const TRAY = 0x3a2a1c;
const TRAY_EDGE = 0x24180f;
const SELECT = 0x3b82f6;
const EXCHANGE = 0xf97316;

/**
 * Screen-fixed layer: the rack tray and its tiles, the tile being dragged, and the running
 * count. Every pointer event on the canvas enters here and goes to the controller.
 */
export class HudScene extends Phaser.Scene {
  private tray!: Phaser.GameObjects.Graphics;
  private rackLayer!: Phaser.GameObjects.Container;
  private ghost: Phaser.GameObjects.Image | null = null;
  private count!: Phaser.GameObjects.Text;
  private caption!: Phaser.GameObjects.Text;
  private unsubscribe: Array<() => void> = [];

  constructor(
    private readonly model: TableModel,
    private readonly controller: TableController,
  ) {
    super({ key: 'hud', active: true });
  }

  create(): void {
    this.input.addPointer(2);
    this.tray = this.add.graphics().setDepth(0);
    this.rackLayer = this.add.container(0, 0).setDepth(1);
    const resolution = Math.max(1, window.devicePixelRatio);
    this.count = this.add
      .text(0, 0, '', { fontFamily: LETTER_FONT, fontStyle: '900', fontSize: '64px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setDepth(5)
      .setAlpha(0)
      .setResolution(resolution);
    this.caption = this.add
      .text(0, 0, '', { fontFamily: BODY_FONT, fontStyle: '700', fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setDepth(5)
      .setAlpha(0)
      .setResolution(resolution);
    this.layoutCount();
    this.drawRack();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.controller.pointerDown(p.id, p.x, p.y));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.controller.pointerMove(p.id, p.x, p.y));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.controller.pointerUp(p.id, p.x, p.y));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.controller.pointerUp(p.id, p.x, p.y));
    this.input.on('gameout', () => this.controller.pointerCancel());
    this.input.on('wheel', (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) =>
      this.controller.wheel(p.x, p.y, dy),
    );

    this.unsubscribe.push(
      this.model.on((kind) => {
        if (kind === 'layout') {
          this.layoutCount();
          this.drawRack();
        } else if (kind === 'draft' || kind === 'snapshot' || kind === 'selection') {
          this.drawRack();
        } else if (kind === 'drag') {
          this.drawRack();
          this.drawGhost();
        } else if (kind === 'theme') {
          this.styleCount();
        }
      }),
      this.model.onBeat((step) => this.onBeat(step)),
    );
    this.styleCount();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach((off) => off()));
  }

  private layoutCount(): void {
    const { board } = this.model.layout;
    const unit = this.model.unit;
    this.count.setPosition(board.x + board.width / 2, board.y + 12 * unit).setFontSize(64 * unit);
    this.caption.setPosition(board.x + board.width / 2, board.y + 86 * unit).setFontSize(22 * unit);
  }

  private styleCount(): void {
    const { emphasis } = this.model.theme;
    const unit = this.model.unit;
    this.count.setColor(emphasis.countText).setStroke(emphasis.countStroke, 10 * unit).setShadow(0, 4 * unit, 'rgba(0,0,0,0.35)', 8 * unit);
    this.caption.setColor(emphasis.highlight).setStroke(emphasis.countStroke, 6 * unit);
  }

  private drawRack(): void {
    const { layout } = this.model;
    const tiles = this.model.rackTiles;
    const dragging = this.model.drag?.tileId ?? null;
    this.tray.clear();
    this.rackLayer.removeAll(true);
    if (!this.model.snapshot?.you) {
      return;
    }
    const unit = this.model.unit;
    const size = layout.tileSize;
    const trayWidth = Math.min(layout.width - 16 * unit, 7 * size * 1.12 + 32 * unit);
    const trayX = (layout.width - trayWidth) / 2;
    const trayY = layout.rack.y + layout.rack.height / 2 - size * 0.62;
    this.tray.fillStyle(TRAY_EDGE, 0.95);
    this.tray.fillRoundedRect(trayX, trayY + 4 * unit, trayWidth, size * 1.24, 14 * unit);
    this.tray.fillStyle(TRAY, 0.95);
    this.tray.fillRoundedRect(trayX, trayY, trayWidth, size * 1.24, 14 * unit);

    const slots = rackSlots(layout, tiles.length);
    tiles.forEach((tile, i) => {
      if (tile.id === dragging) {
        return;
      }
      const slot = slots[i]!;
      const selected = this.model.selectedTileId === tile.id;
      const swapping = this.model.exchange?.has(tile.id) ?? false;
      const lift = selected || swapping ? -8 * unit : 0;
      const image = this.add.image(slot.x, slot.y + lift, tileTexture(this.textures, tile.letter, false)).setDisplaySize(size, size);
      this.rackLayer.add(image);
      if (selected || swapping) {
        const ring = this.add.graphics();
        ring.lineStyle(3 * unit, swapping ? EXCHANGE : SELECT, 1);
        ring.strokeRoundedRect(slot.x - size / 2 - 2 * unit, slot.y + lift - size / 2 - 2 * unit, size + 4 * unit, size + 4 * unit, 9 * unit);
        this.rackLayer.add(ring);
      }
    });
  }

  private drawGhost(): void {
    const drag = this.model.drag;
    if (!drag) {
      this.ghost?.destroy();
      this.ghost = null;
      return;
    }
    const tile = this.model.rack.find((t) => t.id === drag.tileId);
    if (!tile) {
      return;
    }
    const size = this.model.layout.tileSize * 1.1;
    if (!this.ghost) {
      this.ghost = this.add.image(drag.x, drag.y, tileTexture(this.textures, tile.letter, false)).setDepth(10);
    }
    this.ghost.setDisplaySize(size, size).setPosition(drag.x, drag.y - size * 0.25).setAlpha(0.95);
  }

  private onBeat(step: TimelineStep): void {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.tweens.killTweensOf([this.count, this.caption]);
    this.count.setAlpha(1);
    switch (step.kind) {
      case 'highlight':
        this.count.setText('0');
        this.caption.setText(step.words.join(' · ')).setAlpha(1);
        break;
      case 'tile':
      case 'premium':
      case 'word':
        this.count.setText(String(step.running));
        if (step.kind !== 'tile') {
          this.caption.setText(step.label).setAlpha(1);
        }
        if (!reduced) {
          this.count.setScale(step.kind === 'premium' ? 1.18 : 1.06);
          this.tweens.add({ targets: this.count, scale: 1, duration: 160, ease: 'Quad.easeOut' });
        }
        break;
      case 'bingo':
        this.count.setText(String(step.running));
        this.caption.setText(step.label).setAlpha(1);
        if (!reduced) {
          this.count.setScale(1.4);
          this.tweens.add({ targets: this.count, scale: 1, duration: 420, ease: 'Back.easeOut' });
        }
        break;
      case 'total': {
        const name = this.model.snapshot?.seats.find((seat) => seat.seatId === step.seatId);
        const who = step.seatId === this.model.mySeatId ? 'You' : (name?.displayName ?? 'Player');
        this.count.setText(step.label);
        this.caption.setText(`${who} · ${step.score}`).setAlpha(1);
        this.tweens.add({ targets: [this.count, this.caption], alpha: 0, delay: 1200, duration: 500 });
        break;
      }
    }
  }
}
