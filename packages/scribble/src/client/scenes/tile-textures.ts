import type * as Phaser from 'phaser';
import { tileValue } from '../../rules/tiles.js';
import { paintTile, TILE_TEX } from './paint.js';

/** Texture key for a tile face, painted on first use and shared by every scene. */
export function tileTexture(textures: Phaser.Textures.TextureManager, letter: string | null, blank: boolean): string {
  const key = `tile-${letter ?? '_'}-${blank ? 'b' : 'n'}`;
  if (!textures.exists(key)) {
    const texture = textures.createCanvas(key, TILE_TEX, TILE_TEX)!;
    paintTile(texture.getContext(), letter, tileValue({ letter, blank }), blank);
    texture.refresh();
  }
  return key;
}
