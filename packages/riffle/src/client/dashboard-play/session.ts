import type { OutboundMessage, TableSnapshotMessage } from '../../runtime/types.js';
import { renderMyHandPanel } from '../dashboard/my-hand-panel.js';
import { renderLoading } from '../surfaces/loading.js';
import { loadPlayConfig } from './config.js';
import { parseTableIdFromPath } from './route.js';
import { renderSeatedControls, type SeatAction, type SeatedControlsState } from './seated-controls.js';
import { createSitDraft, renderSitPanel, type SitDraft } from './sit-panel.js';
import { renderTableNotFound } from './table-not-found.js';
import { parseCard, renderSnapshotShell } from './view.js';

export interface PlaySocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export type SeatTokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface DashboardPlayDeps {
  root: HTMLElement;
  pathname: string;
  fetch: typeof fetch;
  createSocket: (url: string) => PlaySocket;
  /** Per-tab seat token store so a refresh can reclaim the seat. Defaults to sessionStorage. */
  storage?: SeatTokenStorage | null;
  reconnectDelayMs?: number;
  keepAliveMs?: number;
}

export interface DashboardPlaySession {
  readonly tableId: string | null;
  readonly phase: 'not_found' | 'loading' | 'joined' | 'closed';
  readonly snapshot: TableSnapshotMessage | null;
  readonly seatId: string | null;
  readonly reconnecting: boolean;
  hasSeatToken(): boolean;
  /** Stops reconnecting and closes the socket (page teardown). */
  dispose(): void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
// API Gateway WebSocket connections close after 10 idle minutes.
const DEFAULT_KEEP_ALIVE_MS = 5 * 60 * 1000;
const DEFAULT_RECONNECT_DELAY_MS = 1000;

const SIT_ERROR_NOTICES: Record<string, string> = {
  seat_occupied: 'That seat was just taken. Pick another seat.',
  table_full: 'The table is full.',
  hand_in_progress: 'A hand is in progress. Try again between hands.',
};

const ACTION_ERROR_NOTICES: Record<string, string> = {
  insufficient_players: 'Waiting for another player to sit.',
  hand_in_progress: 'A hand is already in progress.',
  off_turn: "It isn't your turn.",
  illegal_action: "That action isn't allowed right now.",
  version_conflict: 'The table changed. Try again.',
};

function parseServerMessage(data: unknown): OutboundMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      return parsed as OutboundMessage;
    }
  } catch {
    return null;
  }
  return null;
}

function defaultStorage(): SeatTokenStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export async function startDashboardPlay(deps: DashboardPlayDeps): Promise<DashboardPlaySession> {
  const { root } = deps;
  const tableId = parseTableIdFromPath(deps.pathname);
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const storageKey = `riffle.seat.${tableId ?? ''}`;
  const reconnectDelayMs = deps.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  const keepAliveMs = deps.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS;

  let seatToken: string | null = null;
  let resuming = false;
  let leaving = false;
  let reconnectAttempts = 0;
  let disposed = false;
  const sitDraft: SitDraft = createSitDraft();
  const seated: SeatedControlsState = { pending: false, notice: null };
  let socket: PlaySocket | null = null;
  let webSocketUrl = '';

  const session = {
    tableId,
    phase: 'loading' as DashboardPlaySession['phase'],
    snapshot: null as TableSnapshotMessage | null,
    seatId: null as string | null,
    reconnecting: false,
    hasSeatToken: () => seatToken !== null,
    dispose: () => {
      disposed = true;
      socket?.close();
    },
  };

  const readStoredToken = (): string | null => {
    try {
      return storage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  };

  const rememberSeat = (token: string, seatId: string): void => {
    seatToken = token;
    session.seatId = seatId;
    try {
      storage?.setItem(storageKey, token);
    } catch {
      // Storage may be unavailable (private mode); the seat still works until refresh.
    }
  };

  const forgetSeat = (): void => {
    seatToken = null;
    session.seatId = null;
    try {
      storage?.removeItem(storageKey);
    } catch {
      // Nothing stored to clear.
    }
  };

  const failClosed = (): void => {
    if (session.phase === 'not_found' || session.phase === 'closed') {
      return;
    }
    session.phase = session.phase === 'joined' ? 'closed' : 'not_found';
    session.snapshot = null;
    session.reconnecting = false;
    seatToken = null;
    renderTableNotFound(root);
    socket?.close();
  };

  const sendSeatAction = (action: SeatAction): void => {
    if (!socket || !seatToken || session.reconnecting) {
      return;
    }
    seated.pending = true;
    seated.notice = null;
    leaving = action.action === 'leave';
    socket.send(JSON.stringify({ ...action, seatToken }));
    render();
  };

  const render = (): void => {
    const snapshot = session.snapshot;
    if (!snapshot || session.phase !== 'joined') {
      return;
    }
    const local = snapshot.seats.find((seat) => seat.isLocal);
    const regions = renderSnapshotShell(
      root,
      snapshot,
      local && seatToken
        ? () => {
            if (!seated.pending) {
              sendSeatAction({ action: 'leave' });
            }
          }
        : undefined,
    );

    if (!local || !seatToken) {
      regions.myHand.replaceChildren();
      renderSitPanel(regions.actions, snapshot.seats, sitDraft, {
        onChange: render,
        onSit: (seatId, displayName) => {
          socket?.send(JSON.stringify({ action: 'sit', seatId, displayName }));
          render();
        },
      });
      return;
    }

    renderMyHandPanel(regions.myHand, {
      pocketCards: snapshot.pocketCards?.map(parseCard),
      bank: local.stack,
      committedThisHand: snapshot.status === 'hand_in_progress' ? local.committed : undefined,
      street: snapshot.street ?? undefined,
    });
    renderSeatedControls(regions.actions, snapshot, local, seated, sendSeatAction);
  };

  const handleError = (code: string): void => {
    if (session.phase === 'loading' || code === 'table_not_found') {
      failClosed();
      return;
    }

    if (resuming) {
      resuming = false;
      sitDraft.submitting = false;
      forgetSeat();
      render();
      return;
    }

    if (sitDraft.submitting) {
      sitDraft.submitting = false;
      if (code === 'invalid_display_name' || code === 'empty_display_name') {
        sitDraft.nameError = true;
      } else {
        sitDraft.notice = SIT_ERROR_NOTICES[code] ?? "Couldn't take a seat.";
      }
      render();
      return;
    }

    if (seatToken) {
      seated.pending = false;
      leaving = false;
      seated.notice = ACTION_ERROR_NOTICES[code] ?? "That didn't go through. Try again.";
      render();
    }
  };

  const handleSnapshot = (message: TableSnapshotMessage, active: PlaySocket, firstOnSocket: boolean): void => {
    session.phase = 'joined';
    session.reconnecting = false;
    session.snapshot = message;
    reconnectAttempts = 0;
    const isSeatedHere = message.seats.some((seat) => seat.isLocal);

    if (firstOnSocket && !isSeatedHere) {
      const token = seatToken ?? readStoredToken();
      if (token) {
        seatToken = token;
        resuming = true;
        sitDraft.submitting = true;
        active.send(JSON.stringify({ action: 'resume_seat', seatToken: token }));
      }
    }

    if (seatToken && isSeatedHere) {
      sitDraft.submitting = false;
    }
    if (leaving && !isSeatedHere) {
      leaving = false;
      forgetSeat();
    }
    seated.pending = false;
    seated.notice = null;
    render();
  };

  const scheduleReconnect = (): void => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      failClosed();
      return;
    }
    const delay = reconnectDelayMs * 2 ** reconnectAttempts;
    reconnectAttempts += 1;
    session.reconnecting = true;
    seated.pending = false;
    seated.notice = 'Reconnecting…';
    render();
    setTimeout(connect, delay);
  };

  const connect = (): void => {
    let active: PlaySocket;
    try {
      active = deps.createSocket(webSocketUrl);
    } catch {
      if (session.phase === 'joined') {
        scheduleReconnect();
      } else {
        failClosed();
      }
      return;
    }
    socket = active;
    let ended = false;
    let snapshotsOnSocket = 0;
    let keepAlive: ReturnType<typeof setInterval> | undefined;

    const onEnded = (): void => {
      if (ended) {
        return;
      }
      ended = true;
      if (keepAlive !== undefined) {
        clearInterval(keepAlive);
      }
      if (disposed) {
        return;
      }
      if (session.phase === 'joined') {
        resuming = false;
        scheduleReconnect();
        return;
      }
      failClosed();
    };

    active.addEventListener('open', () => {
      active.send(JSON.stringify({ action: 'join_table', tableId }));
      keepAlive = setInterval(() => {
        if (!ended) {
          active.send(JSON.stringify({ action: 'ping' }));
        }
      }, keepAliveMs);
    });
    active.addEventListener('error', onEnded);
    active.addEventListener('close', onEnded);
    active.addEventListener('message', (event) => {
      if (ended || disposed) {
        return;
      }
      const message = parseServerMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === 'error') {
        handleError(message.code);
        return;
      }

      if (message.type === 'sat') {
        if (!sitDraft.submitting) {
          return;
        }
        resuming = false;
        rememberSeat(message.seatToken, message.seatId);
        return;
      }

      if (message.type === 'table_snapshot' && message.tableId === tableId) {
        if (session.phase !== 'loading' && session.phase !== 'joined') {
          return;
        }
        snapshotsOnSocket += 1;
        handleSnapshot(message, active, snapshotsOnSocket === 1);
      }
    });
  };

  if (!tableId) {
    session.phase = 'not_found';
    renderTableNotFound(root);
    return session;
  }

  renderLoading(root, { copy: 'shared' });

  const config = await loadPlayConfig(deps.fetch);
  if (!config) {
    failClosed();
    return session;
  }
  webSocketUrl = config.webSocketUrl;
  connect();

  return session;
}
