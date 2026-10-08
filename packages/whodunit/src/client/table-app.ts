import { galaxyClassSignInUrl, galaxyClassSignUpUrl } from '@galaxyclass/accounts/game-header';
import type { CardId, EventMessage, SeatId } from '../protocol.js';
import type { RoomId, SuspectId, TokenPosition, WeaponId } from '../rules/types.js';
import { ManorAudio } from './audio.js';
import { ServerClock } from './clock.js';
import type { WhodunitConfig } from './config.js';
import { TableController } from './controller.js';
import { MotionPreference } from './fx/motion.js';
import { renderNotice } from './lobby.js';
import { TableModel } from './model.js';
import { namesFor, type Names } from './narrate.js';
import { cycleMark, loadNotes, noteRows, notesKey, saveNotes, setMark, type NoteMarks } from './notes.js';
import { accessTokenSource } from './player-token.js';
import { Presenter } from './presenter.js';
import { publicBase, tablePath } from './route.js';
import { TableSession, type SeatTokenStore } from './session.js';
import { viewModel, type ViewModel } from './view-model.js';
import { TableView } from './views/table-view.js';

/** Test hooks for the dev server only; production config never sets `dev`. */
export interface WhodunitDebug {
  model: TableModel;
  vm(): ViewModel;
  serverNow(): number;
  /** `data-dest` keys of the squares and rooms lit for your move, e.g. `room:parlor`, `hall:7,4`. */
  destinations(): string[];
  /** Viewport position of a lit destination's centre (scrolled into view); null when not lit. */
  destPoint(key: string): { x: number; y: number } | null;
  /** Plays an event as if the server had sent it. */
  playEvent(message: EventMessage): void;
  /** Every animation step so far, e.g. `rolled 2 3+4`, `walk 2 7 room:parlor`, `done 1-4`. */
  fxLog(): string[];
}

/** Per-table, per-member seat token in localStorage, so a reload or a new tab takes the held seat back. */
export function seatTokenStore(tableId: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): SeatTokenStore {
  const key = (member: string) => `whodunit.seat.${tableId}.${member}`;
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
    body: 'Whodunit? tables are for Galaxy Class members. Sign in, or create a free account, to join this table.',
    signIn: true,
  },
  invalid_access_token: {
    title: 'Sign in again',
    body: 'Your sign-in has expired. Sign in again to join this table.',
    signIn: true,
  },
  identity_unavailable: {
    title: 'Sign-in checks are down',
    body: 'Whodunit? cannot check sign-ins right now. Try this link again in a moment.',
    signIn: false,
  },
};

export function startTable(host: HTMLElement, config: WhodunitConfig, tableId: string): void {
  const model = new TableModel(tableId);
  const clock = new ServerClock();
  const motion = new MotionPreference(window);
  const storage = safeLocalStorage();
  const audio = new ManorAudio(storage);
  const shareLink = `${window.location.origin}${tablePath(tableId)}`;
  let connected = false;
  let named: string | null = null;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let notes: { key: string; marks: NoteMarks } = { key: '', marks: {} };

  const currentVm = (): ViewModel =>
    viewModel(model.presented, {
      serverNow: clock.serverNow(),
      resolving: presenter.busy,
      offline: model.offline,
      pending: model.pending,
    });

  const names = (): Names => {
    const snapshot = model.presented;
    return namesFor(snapshot?.seats ?? [], snapshot?.you?.seatId ?? null, snapshot?.recap?.roster);
  };

  /** The notepad for this case, loaded when the case (or the member) changes. */
  const currentNotes = (): NoteMarks => {
    const snapshot = model.presented;
    const member = session.memberId ?? snapshot?.you?.seatId ?? null;
    if (!snapshot?.you || !member) {
      return {};
    }
    const key = notesKey(tableId, snapshot.gameNumber, member);
    if (notes.key !== key) {
      notes = { key, marks: loadNotes(storage, key) };
    }
    return notes.marks;
  };

  const render = () => {
    if (stopped) {
      return;
    }
    const vm = currentVm();
    const snapshot = model.presented;
    const rows = snapshot?.you ? noteRows(snapshot, currentNotes()) : [];
    view.render(vm, snapshot, rows, names());
    // Re-render when the next action opens, and every 30 s for away timers.
    if (renderTimer) {
      clearTimeout(renderTimer);
    }
    const opensAt = snapshot?.status === 'playing' ? snapshot.nextActionAt : null;
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
    document.title = `${name} · Whodunit?`;
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
    play: (message, schedule, elapsed, before) => {
      model.playing = message;
      view.playEvent(message, schedule, elapsed, before, names());
      render();
    },
    stop: () => view.stopFx(),
    log: (event, step) => model.logFx(event.eventId, step),
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
        case 'event':
          presenter.onEvent(event.message);
          break;
        case 'pong':
          clock.onPong(event.serverTs, event.sentAt, event.receivedAt);
          break;
        case 'deleted':
          teardown();
          renderNotice(host, {
            title: 'Table deleted',
            body: 'The host deleted this table, so its case and seats are gone.',
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
            model.pending = null;
            const held = model.presented?.status === 'playing' && Boolean(model.presented?.you);
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
    chooseSuspect: (suspect: SuspectId) => controller.chooseSuspect(suspect),
    ready: () => controller.ready(),
    unready: () => controller.unready(),
    startGame: () => controller.startGame(),
    roll: () => controller.roll(),
    takePassage: () => controller.takePassage(),
    move: (to: TokenPosition) => controller.move(to),
    suggest: (suspect: SuspectId, weapon: WeaponId) => controller.suggest(suspect, weapon),
    showCard: (card: CardId) => controller.showCard(card),
    accuse: (suspect: SuspectId, weapon: WeaponId, room: RoomId) => controller.accuse(suspect, weapon, room),
    endTurn: () => controller.endTurn(),
    newGame: () => controller.newGame(),
    claimAbandoned: () => controller.claimAbandoned(),
    leave: () => controller.leave(),
    cycleNote: (card: CardId, seatId: SeatId) => {
      const current = currentNotes();
      if (!notes.key) {
        return;
      }
      const next = setMark(current, card, seatId, cycleMark(current[card]?.[seatId] ?? ''));
      notes = { key: notes.key, marks: next };
      saveNotes(storage, notes.key, next);
      render();
    },
    toggleMute: () => {
      audio.setMuted(!audio.muted);
      view.setMuted(audio.muted);
    },
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

  const controller = new TableController(
    model,
    session,
    {
      toast: (text, tone) => view.overlay.toast(text, tone),
      announce: (text) => view.overlay.announce(text),
      confirm: (text) => window.confirm(text),
      render,
    },
    { vm: currentVm },
  );

  // Browsers allow audio only after a gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      view.panel.closeSheets();
    }
  });
  motion.onChange(() => render());

  if (config.dev) {
    const debug: WhodunitDebug = {
      model,
      vm: currentVm,
      serverNow: () => clock.serverNow(),
      destinations: () => view.board.destinations(),
      destPoint: (key) => {
        const node = view.board.svgEl.querySelector<SVGElement>(`[data-dest="${CSS.escape(key)}"]`);
        if (!node?.isConnected) {
          return null;
        }
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = node.getBoundingClientRect();
        return rect.width > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      },
      playEvent: (message) => presenter.onEvent(message),
      fxLog: () => [...model.fxLog],
    };
    (window as unknown as { __whodunit: WhodunitDebug }).__whodunit = debug;
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
