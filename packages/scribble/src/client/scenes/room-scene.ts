import * as Phaser from 'phaser';
import type { Decoration } from '../../themes/types.js';
import type { TableModel } from '../model.js';
import { paintDecoration, placementRandom } from './paint.js';

interface Drifter {
  image: Phaser.GameObjects.Image;
  speed: number;
  sway: number;
  phase: number;
  baseX: number;
}

/** The room behind the board: sky, floor, and the theme's decorations. */
export class RoomScene extends Phaser.Scene {
  private backdrop: Phaser.GameObjects.Image | null = null;
  private drifters: Drifter[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly model: TableModel) {
    super({ key: 'room', active: true });
  }

  create(): void {
    this.redraw();
    this.unsubscribe = this.model.on((kind) => {
      if (kind === 'theme' || kind === 'layout') {
        this.redraw();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  update(_time: number, delta: number): void {
    const height = this.model.layout.height;
    const seconds = delta / 1000;
    for (const drifter of this.drifters) {
      drifter.phase += seconds;
      drifter.image.y += drifter.speed * this.model.unit * seconds;
      drifter.image.x = drifter.baseX + Math.sin(drifter.phase * 0.8) * drifter.sway;
      const margin = drifter.image.displayHeight;
      if (drifter.speed > 0 && drifter.image.y > height + margin) {
        drifter.image.y = -margin;
      } else if (drifter.speed < 0 && drifter.image.y < -margin) {
        drifter.image.y = height * 0.6;
      }
    }
  }

  private redraw(): void {
    const { width, height } = this.model.layout;
    const theme = this.model.theme;
    const unit = this.model.unit;
    for (const drifter of this.drifters) {
      drifter.image.destroy();
    }
    this.drifters = [];
    this.backdrop?.destroy();

    const key = `room-${theme.id}-${width}x${height}`;
    if (!this.textures.exists(key)) {
      for (const stale of this.textures.getTextureKeys().filter((k) => k.startsWith('room-'))) {
        this.textures.remove(stale);
      }
      const texture = this.textures.createCanvas(key, width, height)!;
      const ctx = texture.getContext();
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, theme.room.skyTop);
      sky.addColorStop(1, theme.room.skyBottom);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);
      const floorY = height * 0.82;
      const floor = ctx.createLinearGradient(0, floorY - 30 * unit, 0, height);
      floor.addColorStop(0, 'rgba(0,0,0,0)');
      floor.addColorStop(0.25, theme.room.floor);
      floor.addColorStop(1, theme.room.floor);
      ctx.fillStyle = floor;
      ctx.fillRect(0, floorY - 30 * unit, width, height - floorY + 30 * unit);

      const random = placementRandom(theme.id);
      for (const decoration of theme.room.decorations.filter((d) => d.drift === 0)) {
        this.paintStatic(ctx, decoration, random, width, height, unit);
      }
      texture.refresh();
    }
    this.backdrop = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);

    const random = placementRandom(`${theme.id}-drift`);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const decoration of theme.room.decorations.filter((d) => d.drift !== 0)) {
      const size = 64;
      const textureKey = `deco-${decoration.shape}-${decoration.color}`;
      if (!this.textures.exists(textureKey)) {
        const texture = this.textures.createCanvas(textureKey, size, size)!;
        paintDecoration(texture.getContext(), decoration.shape, decoration.color, size);
        texture.refresh();
      }
      for (let i = 0; i < decoration.count; i++) {
        const display = this.sizeFor(decoration, random, height, unit);
        const x = random() * width;
        const y = random() * height * decoration.band;
        const image = this.add.image(x, y, textureKey).setDisplaySize(display, display).setDepth(1).setAlpha(0.85);
        this.drifters.push({
          image,
          speed: reduced ? 0 : decoration.drift * (0.6 + random() * 0.8),
          sway: reduced ? 0 : (8 + random() * 16) * unit,
          phase: random() * 10,
          baseX: x,
        });
      }
    }
  }

  private sizeFor(decoration: Decoration, random: () => number, height: number, unit: number): number {
    const [min, max] = decoration.size;
    const scale = Math.max(0.6, Math.min(1.4, height / unit / 1000));
    return (min + random() * (max - min)) * scale * unit;
  }

  private paintStatic(
    ctx: CanvasRenderingContext2D,
    decoration: Decoration,
    random: () => number,
    width: number,
    height: number,
    unit: number,
  ): void {
    const sprite = document.createElement('canvas');
    sprite.width = 128;
    sprite.height = 128;
    paintDecoration(sprite.getContext('2d')!, decoration.shape, decoration.color, 128);
    for (let i = 0; i < decoration.count; i++) {
      const size = this.sizeFor(decoration, random, height, unit);
      const x = random() * width;
      const ground = decoration.shape === 'tree';
      const y = ground ? height * 0.82 - size * (0.7 + random() * 0.2) : random() * height * decoration.band;
      ctx.globalAlpha = decoration.shape === 'dot' ? 0.4 + random() * 0.6 : 0.9;
      ctx.drawImage(sprite, x - size / 2, ground ? y : y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
