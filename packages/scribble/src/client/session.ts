import type { Placement } from '../rules/types.js';
import type { ThemeId } from '../themes/ids.js';
import type { ErrorMessage, OutboundMessage, TableSnapshot } from '../runtime/types.js';
import type { GetAccessToken } from './player-token.js';

export type TableList = Extract<OutboundMessage, { type: 'table_list' }>['tables'];

export type SessionEvent =
  | { type: 'status'; status: 'connecting' | 'open' | 'closed' }
  | { type: 'snapshot'; snapshot: TableSnapshot }
  | { type: 'error'; error: ErrorMessage }
  | { type: 'sat'; seatId: string }
  | { type: 'left'; reason?: 'taken_over' }
  | { type: 'word_check'; words: Array<{ text: string; valid: boolean }> };

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type SocketFactory = (url: string) => SocketLike;

/** Where this table's seat token survives a reload, a closed tab, or a sleeping laptop. */
export interface SeatTokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

const OPEN = 1;
const PING_MS = 4 * 60 * 1000;
/** A socket that has not answered a ping by now is treated as dead (common after sleep). */
const PONG_TIMEOUT_MS = 8000;
/** Retries never stop; the last delay repeats. */
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

function parseMessage(data: unknown): OutboundMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const value = JSON.parse(data) as unknown;
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
      ? (value as OutboundMessage)
      : null;
  } catch {
    return null;
  }
}

/**
 * One table connection. The server holds an in-game seat while its player is away; the seat
 * token kept in `seatStore` takes it back from any later connection, and a signed-in player can
 * also take it back by signing in. Only an explicit leave gives the seat up.
 */
export class TableSession {
  private socket: SocketLike | null = null;
  private seatToken: string | null = null;
  private wantsSeat: boolean;
  private sitPending = false;
  private resumePending = false;
  private closedByUser = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private latest: TableSnapshot | null = null;

  constructor(
    private readonly options: {
      url: string;
      tableId: string;
      getAccessToken: GetAccessToken;
      seatStore?: SeatTokenStore;
      socketFactory?: SocketFactory;
      autoSit?: boolean;
      onEvent: (event: SessionEvent) => void;
    },
  ) {
    this.wantsSeat = options.autoSit ?? true;
  }

  get seated(): boolean {
    return this.seatToken !== null;
  }

  connect(): void {
    this.closedByUser = false;
    if (!this.socket) {
      this.open();
    }
  }

  close(): void {
    this.closedByUser = true;
    this.stopTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  /** The page became visible or the network came back: reconnect now, or prove the socket is alive. */
  wake(): void {
    if (this.closedByUser) {
      return;
    }
    if (!this.socket) {
      this.attempts = 0;
      this.open();
    } else if (this.socket.readyState === OPEN) {
      this.probe();
    }
  }

  sit(): void {
    this.wantsSeat = true;
    this.claimSeat();
  }

  leave(): void {
    this.wantsSeat = false;
    this.sendSeated({ action: 'leave' });
  }

  startGame(): void {
    this.sendSeated({ action: 'start_game' });
  }

  play(placements: Placement[]): void {
    this.sendSeated({ action: 'play', placements });
  }

  pass(): void {
    this.sendSeated({ action: 'pass' });
  }

  exchange(tileIds: string[]): void {
    this.sendSeated({ action: 'exchange', tileIds });
  }

  setTheme(themeId: ThemeId): void {
    this.sendSeated({ action: 'set_theme', themeId });
  }

  removePlayer(seatId: string): void {
    this.sendSeated({ action: 'remove_player', seatId });
  }

  /** Word-list lookups for the score preview. Needs no seat. */
  checkWords(words: string[]): void {
    this.send({ action: 'check_words', words });
  }

  private open(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const factory = this.options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
    const socket = factory(this.options.url);
    this.socket = socket;
    this.seatToken = null;
    this.sitPending = false;
    this.resumePending = false;
    this.options.onEvent({ type: 'status', status: 'connecting' });

    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.attempts = 0;
      this.options.onEvent({ type: 'status', status: 'open' });
      this.send({ action: 'join_table', tableId: this.options.tableId });
      this.startPing();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.clearPong();
      this.receive(parseMessage(event.data));
    };
    socket.onerror = () => {};
    socket.onclose = () => this.lost(socket);
  }

  /** The socket is gone, whether it said so or stopped answering. Reconnect with backoff. */
  private lost(socket: SocketLike): void {
    if (this.socket !== socket) {
      return;
    }
    this.stopTimers();
    this.socket = null;
    this.seatToken = null;
    this.options.onEvent({ type: 'status', status: 'closed' });
    try {
      socket.close();
    } catch {
      // Already closed.
    }
    if (this.closedByUser) {
      return;
    }
    const delay = RECONNECT_DELAYS[Math.min(this.attempts, RECONNECT_DELAYS.length - 1)]!;
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser && !this.socket) {
        this.open();
      }
    }, delay);
  }

  private receive(message: OutboundMessage | null): void {
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'table_snapshot':
        this.latest = message;
        this.options.onEvent({ type: 'snapshot', snapshot: message });
        if (!this.seatToken && !message.you) {
          this.claimSeat();
        }
        break;
      case 'sat':
        this.sitPending = false;
        this.resumePending = false;
        this.seatToken = message.seatToken;
        this.options.seatStore?.set(message.seatToken);
        this.options.onEvent({ type: 'sat', seatId: message.seatId });
        break;
      case 'left':
        this.seatToken = null;
        if (message.reason === 'taken_over') {
          // Another window has the seat now; trying to take it back would bounce it between them.
          this.wantsSeat = false;
        } else {
          this.options.seatStore?.clear();
        }
        this.options.onEvent({ type: 'left', ...(message.reason ? { reason: message.reason } : {}) });
        break;
      case 'word_check':
        this.options.onEvent({ type: 'word_check', words: message.words });
        break;
      case 'error':
        if (this.resumePending && (message.code === 'invalid_seat_token' || message.code === 'already_seated')) {
          // The held seat is gone (removed, or freed when a new game started). Sit fresh instead.
          this.resumePending = false;
          this.options.seatStore?.clear();
          this.claimSeat();
          return;
        }
        if (message.code === 'invalid_seat_token' || message.code === 'not_seated') {
          this.seatToken = null;
        }
        if (['table_full', 'seat_occupied', 'already_seated', 'invalid_access_token', 'identity_unavailable'].includes(message.code)) {
          this.sitPending = false;
          if (message.code !== 'already_seated') {
            this.wantsSeat = false;
          }
        }
        this.options.onEvent({ type: 'error', error: message });
        break;
      default:
        break;
    }
  }

  /** Takes back a held seat when there is a token for it; otherwise sits in an open one. */
  private claimSeat(): void {
    if (!this.wantsSeat || this.sitPending || this.resumePending || this.seatToken || this.socket?.readyState !== OPEN) {
      return;
    }
    const stored = this.options.seatStore?.get() ?? null;
    if (stored) {
      this.resumePending = true;
      this.send({ action: 'resume', seatToken: stored });
      return;
    }
    void this.trySit();
  }

  private async trySit(): Promise<void> {
    if (this.sitPending || this.seatToken || !this.latest) {
      return;
    }
    this.sitPending = true;
    const accessToken = await this.options.getAccessToken();
    // A signed-in player may already hold a seat at a full table; the server hands it back.
    if (!accessToken && !this.latest.seats.some((seat) => !seat.occupied)) {
      this.sitPending = false;
      return;
    }
    this.send(accessToken ? { action: 'sit', accessToken } : { action: 'sit' });
  }

  private sendSeated(message: Record<string, unknown>): void {
    if (!this.seatToken) {
      this.options.onEvent({ type: 'error', error: { type: 'error', code: 'not_seated' } });
      return;
    }
    this.send({ ...message, seatToken: this.seatToken });
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private probe(): void {
    const socket = this.socket;
    if (!socket || this.pongTimer) {
      return;
    }
    this.send({ action: 'ping' });
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      this.lost(socket);
    }, PONG_TIMEOUT_MS);
  }

  private clearPong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private startPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    this.pingTimer = setInterval(() => this.probe(), PING_MS);
  }

  private stopTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPong();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Asks the server which configured tables are open and how full they are. */
export function fetchTableList(
  url: string,
  tableIds: string[],
  socketFactory: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike,
  timeoutMs = 6000,
): Promise<TableList | null> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = socketFactory(url);
    const finish = (value: TableList | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.close();
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.onopen = () => socket.send(JSON.stringify({ action: 'list_tables', tableIds }));
    socket.onmessage = (event) => {
      const message = parseMessage(event.data);
      if (message?.type === 'table_list') {
        finish(message.tables);
      }
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}
