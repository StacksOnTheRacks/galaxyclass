import * as Phaser from 'phaser';
import type { ScribbleConfig } from './config.js';
import { TableController } from './controller.js';
import { worldToScreen } from './camera.js';
import { cellCenter, rackSlots } from './layout.js';
import { renderMessage } from './lobby.js';
import { TableModel } from './model.js';
import { TableOverlay } from './overlay.js';
import { accessTokenSource } from './player-token.js';
import { publicBase } from './route.js';
import { BoardScene } from './scenes/board-scene.js';
import { HudScene } from './scenes/hud-scene.js';
import { RoomScene } from './scenes/room-scene.js';
import { TableSession, type SeatTokenStore } from './session.js';

/** Test hooks for the dev server only; production config never sets `dev`. */
export interface ScribbleDebug {
  model: TableModel;
  game: Phaser.Game;
  /** CSS-pixel page position of a rack tile, by id. */
  rackTilePoint(tileId: string): { x: number; y: number } | null;
  /** CSS-pixel page position of a board square's centre. */
  squarePoint(row: number, col: number): { x: number; y: number };
}

/** Per-table seat token in localStorage, so a reload or a new tab takes the held seat back. */
function seatTokenStore(tableId: string): SeatTokenStore {
  const key = `scribble.seat.${tableId}`;
  return {
    get: () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (token) => {
      try {
        window.localStorage.setItem(key, token);
      } catch {
        // Storage is off (private mode); the seat still resumes for a signed-in player.
      }
    },
    clear: () => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // As above.
      }
    },
  };
}

export function startTable(host: HTMLElement, config: ScribbleConfig, tableId: string): void {
  const listing = config.tables.find((table) => table.id === tableId);
  const unit = Math.min(window.devicePixelRatio || 1, 2);
  const model = new TableModel(window.innerWidth * unit, window.innerHeight * unit, unit);
  const overlay = new TableOverlay(host, model, listing?.name ?? 'Table');
  let connected = false;

  const session = new TableSession({
    url: config.webSocketUrl,
    tableId,
    getAccessToken: accessTokenSource(config, window.sessionStorage),
    seatStore: seatTokenStore(tableId),
    onEvent: (event) => {
      switch (event.type) {
        case 'snapshot':
          controller.onSnapshot(event.snapshot);
          break;
        case 'word_check':
          controller.onWordCheck(event.words);
          break;
        case 'left':
          if (event.reason === 'taken_over') {
            overlay.toast('Your seat moved to another window or device.');
          }
          break;
        case 'error':
          if (event.error.code === 'table_not_found') {
            session.close();
            game.destroy(true);
            renderMessage(host, 'Table not found', 'That table does not exist or is no longer open.', 'See open tables', publicBase());
            return;
          }
          controller.onError(event.error);
          break;
        case 'status':
          if (event.status === 'open') {
            connected = true;
          } else if (event.status === 'closed' && connected) {
            connected = false;
            const held = model.snapshot?.status === 'playing' && model.snapshot.seats.some((s) => s.isLocal && s.inGame);
            overlay.toast(held ? 'Connection lost. Your seat is held while we reconnect…' : 'Connection lost. Reconnecting…', 'error');
          }
          break;
        default:
          break;
      }
    },
  });

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const controller = new TableController(model, session, overlay, {
    reducedMotion: () => reduced?.matches ?? false,
    hidden: () => document.visibilityState === 'hidden',
  });
  overlay.bind(controller);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: overlay.stage,
    width: model.layout.width,
    height: model.layout.height,
    transparent: true,
    banner: false,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / unit },
    render: { antialias: true },
    input: { activePointers: 3 },
    scene: [new RoomScene(model), new BoardScene(model), new HudScene(model, controller)],
  });

  game.events.once(Phaser.Core.Events.READY, () => {
    const canvas = game.canvas;
    canvas.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const width = window.innerWidth * unit;
      const height = window.innerHeight * unit;
      game.scale.resize(width, height);
      game.scale.setZoom(1 / unit);
      model.resize(width, height);
    });
  });

  if (config.dev) {
    const debug: ScribbleDebug = {
      model,
      game,
      rackTilePoint(tileId) {
        const tiles = model.rackTiles;
        const index = tiles.findIndex((tile) => tile.id === tileId);
        if (index === -1) {
          return null;
        }
        const slot = rackSlots(model.layout, tiles.length)[index]!;
        return { x: slot.x / unit, y: slot.y / unit };
      },
      squarePoint(row, col) {
        const center = cellCenter(row, col);
        const screen = worldToScreen(model.camera, model.layout.board, center.x, center.y);
        return { x: screen.x / unit, y: screen.y / unit };
      },
    };
    (window as unknown as { __scribble: ScribbleDebug }).__scribble = debug;
  }

  session.connect();
  window.addEventListener('pagehide', () => session.close());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      session.connect();
    }
  });
  window.addEventListener('online', () => session.wake());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      session.wake();
      controller.onVisible();
    }
  });
}
