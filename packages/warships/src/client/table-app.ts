import { galaxyClassSignInUrl, galaxyClassSignUpUrl } from '@galaxyclass/accounts/game-header';
import type { ShotEvent } from '../protocol.js';
import type { Fleet, ShipId } from '../rules/types.js';
import { SonarAudio } from './audio.js';
import { ServerClock } from './clock.js';
import type { WarshipsConfig } from './config.js';
import { TableController } from './controller.js';
import { loadLastFleet, placedShips, type Draft } from './draft.js';
import { MotionPreference } from './fx/motion.js';
import { renderNotice } from './lobby.js';
import { TableModel } from './model.js';
import { accessTokenSource } from './player-token.js';
import { Presenter } from './presenter.js';
import { publicBase, tablePath } from './route.js';
import { TableSession, type SeatTokenStore } from './session.js';
import { viewModel, type ViewModel } from './view-model.js';
import { TableView } from './views/table-view.js';

/** Test hooks for the dev server only; production config never sets `dev`. */
export interface WarshipsDebug {
  model: TableModel;
  /** Viewport position of a cell's centre on your board or the enemy's (scrolled into view); null when not shown. */
  cellPoint(board: 'own' | 'target', row: number, col: number): { x: number; y: number } | null;
  /** Viewport position of a tray ship, while placing. */
  trayPoint(shipId: ShipId): { x: number; y: number } | null;
  /** Replaces the placement draft outright. */
  setDraft(fleet: Fleet): void;
  /** Plays a shot as if the server had sent it. */
  playShot(event: ShotEvent): void;
  serverNow(): number;
}

/** Per-table, per-member seat token in localStorage, so a reload or a new tab takes the held seat back. */
export function seatTokenStore(tableId: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): SeatTokenStore {
  const key = (member: string) => `warships.seat.${tableId}.${member}`;
  return {
    get: (member) => {
      try {
        return storage.getItem(key(member));
      } catch {
        return null;
      }
    },
    set: (member, token) => {
      try {
        storage.setItem(key(member), token);
      } catch {
        // Storage is off (private mode); the seat still resumes for a signed-in member.
      }
    },
    clear: (member) => {
      try {
        storage.removeItem(key(member));
      } catch {
        // As above.
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Shown instead of the table when the server will not let this visitor in. */
const ENTRY_REFUSALS: Record<string, { title: string; body: string; signIn: boolean }> = {
  sign_in_required: {
    title: 'Members only',
    body: 'Warships tables are for Galaxy Class members. Sign in, or create a free account, to join this table.',
    signIn: true,
  },
  invalid_access_token: {
    title: 'Sign in again',
    body: 'Your sign-in has expired. Sign in again to join this table.',
    signIn: true,
  },
  identity_unavailable: {
    title: 'Sign-in checks are down',
    body: 'Warships cannot check sign-ins right now. Try this link again in a moment.',
    signIn: false,
  },
};

export function startTable(host: HTMLElement, config: WarshipsConfig, tableId: string): void {
  const model = new TableModel(tableId);
  const clock = new ServerClock();
  const motion = new MotionPreference(window);
  const storage = safeLocalStorage();
  const audio = new SonarAudio(storage);
  const shareLink = `${window.location.origin}${tablePath(tableId)}`;
  let connected = false;
  let named: string | null = null;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const currentVm = (): ViewModel =>
    viewModel(model.presented, placedShips(model.draft), {
      serverNow: clock.serverNow(),
      resolving: presenter.busy,
      offline: model.offline,
    });

  const render = () => {
    if (stopped) {
      return;
    }
    const vm = currentVm();
    view.render(vm, model.presented, model.pendingTarget);
    // Re-render when the turn opens, and every 30 s for away timers.
    if (renderTimer) {
      clearTimeout(renderTimer);
    }
    const opensAt = model.presented?.status === 'battle' ? model.presented.turnOpensAt : null;
    const untilOpen = opensAt !== null ? opensAt - clock.serverNow() : Number.POSITIVE_INFINITY;
    const delay = untilOpen > 0 ? Math.min(untilOpen + 20, 30_000) : 30_000;
    renderTimer = setTimeout(render, delay);
  };

  const showName = (tableName: string | null) => {
    const name = tableName ?? 'Table';
    if (name === named) {
      return;
    }
    named = name;
    document.title = `${name} · Warships`;
    view.setTableName(name);
  };

  const teardown = () => {
    stopped = true;
    session.close();
    presenter.reset();
    view.stopFx();
    if (renderTimer) {
      clearTimeout(renderTimer);
    }
  };

  const refuse = (title: string, body: string, signIn: boolean) => {
    teardown();
    const here = tablePath(tableId);
    renderNotice(host, {
      title,
      body,
      returnTo: here,
      ...(signIn ? { account: null } : {}),
      actions: signIn
        ? [
            { label: 'Sign in', href: galaxyClassSignInUrl(here), primary: true },
            { label: 'Create an account', href: galaxyClassSignUpUrl(here) },
          ]
        : [
            { label: 'Try again', href: here, primary: true },
            { label: 'Back to your tables', href: publicBase() },
          ],
    });
  };

  const presenter = new Presenter({
    serverNow: () => clock.serverNow(),
    reducedMotion: () => motion.reduced,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    present: (snapshot) => {
      model.present(snapshot);
      model.playing = presenter.current;
      render();
    },
    play: (shot, schedule, elapsed) => {
      model.playing = shot;
      model.pendingTarget = null;
      const me = model.presented?.you?.seatId ?? null;
      const shooter = model.presented?.seats.find((seat) => seat.seatId === shot.shooter);
      view.playShot(shot, schedule, elapsed, me, { shooter: shooter?.displayName ?? 'Your opponent' });
      render();
    },
    stop: () => view.stopFx(),
    log: (shot, step) => model.logFx(shot.shotId, step),
  });

  const session = new TableSession({
    url: config.webSocketUrl,
    tableId,
    getAccessToken: accessTokenSource(config, window.sessionStorage),
    ...(storage ? { seatStore: seatTokenStore(tableId, storage) } : {}),
    onEvent: (event) => {
      if (stopped) {
        return;
      }
      switch (event.type) {
        case 'snapshot':
          clock.onServerTs(event.snapshot.serverTs);
          model.latest = event.snapshot;
          showName(event.snapshot.tableName);
          presenter.onSnapshot(event.snapshot);
          break;
        case 'shot':
          presenter.onShot(event.shot);
          break;
        case 'pong':
          clock.onPong(event.serverTs, event.sentAt, event.receivedAt);
          break;
        case 'deleted':
          teardown();
          renderNotice(host, {
            title: 'Table deleted',
            body: 'The host deleted this table, so its battle and seats are gone.',
            returnTo: tablePath(tableId),
            actions: [{ label: 'Back to your tables', href: publicBase(), primary: true }],
          });
          return;
        case 'left':
          if (event.reason === 'taken_over') {
            view.overlay.toast('Your seat moved to another window or device.');
          }
          break;
        case 'error':
          if (event.error.code === 'table_not_found') {
            refuse('Table not found', 'That table does not exist, or its link was mistyped.', false);
            return;
          }
          if (!model.latest && ENTRY_REFUSALS[event.error.code]) {
            const { title, body, signIn } = ENTRY_REFUSALS[event.error.code]!;
            refuse(title, body, signIn);
            return;
          }
          controller.onError(event.error);
          break;
        case 'status':
          if (event.status === 'open') {
            connected = true;
            if (model.offline) {
              model.offline = false;
              render();
            }
          } else if (event.status === 'closed' && connected) {
            connected = false;
            model.offline = true;
            const status = model.presented?.status;
            const held = (status === 'placing' || status === 'battle') && Boolean(model.presented?.you);
            view.overlay.toast(held ? 'Connection lost. Your seat is held while we reconnect…' : 'Connection lost. Reconnecting…', 'error');
            render();
          }
          break;
        default:
          break;
      }
    },
  });

  const intents = {
    fire: (coord: { row: number; col: number }) => controller.fire(coord),
    ready: (fleet: Fleet) => controller.ready(fleet),
    unready: () => controller.unready(),
    forfeit: () => controller.forfeit(),
    claimAbandoned: () => controller.claimAbandoned(),
    leave: () => controller.leave(),
    rematch: () => controller.rematch(),
    toggleMute: () => {
      audio.setMuted(!audio.muted);
      view.setMuted(audio.muted);
    },
    draft: () => model.draft,
    setDraft: (draft: Draft) => {
      model.draft = draft;
      render();
    },
    lastFleet: () => loadLastFleet(storage, tableId),
  };

  const view = new TableView(host, intents, {
    audio,
    reducedMotion: () => motion.reduced,
    shareLink,
    copy: async (text) => {
      try {
        if (!navigator.clipboard) {
          return false;
        }
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
  });

  const controller = new TableController(model, session, {
    toast: (text, tone) => view.overlay.toast(text, tone),
    announce: (text) => view.overlay.announce(text),
    confirm: (text) => window.confirm(text),
    render,
  }, { storage, vm: currentVm });

  // Browsers allow audio only after a gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('contextmenu', (event) => {
    if ((event.target as HTMLElement | null)?.closest?.('.ws-board')) {
      event.preventDefault();
    }
  });
  motion.onChange(() => render());

  if (config.dev) {
    const debug: WarshipsDebug = {
      model,
      cellPoint: (board, row, col) => {
        const cell = (board === 'own' ? view.own : view.target).cells[row]?.[col];
        if (!cell?.isConnected) {
          return null;
        }
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = cell.getBoundingClientRect();
        return rect.width > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      },
      trayPoint: (shipId) => {
        const item = view.placement.panel.querySelector<HTMLElement>(`.ws-tray-ship[data-ship="${shipId}"]`);
        if (!item?.isConnected || item.hidden) {
          return null;
        }
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = item.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      },
      setDraft: (fleet) => view.placement.setDraft(fleet),
      playShot: (event) => presenter.onShot(event),
      serverNow: () => clock.serverNow(),
    };
    (window as unknown as { __warships: WarshipsDebug }).__warships = debug;
  }

  render();
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
      presenter.catchUp();
      render();
    }
  });
}
