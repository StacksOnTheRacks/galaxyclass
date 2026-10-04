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
  | { type: 'left' };

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;
const PING_MS = 4 * 60 * 1000;
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
 * One table connection. The seat token lives only in this object's memory: a reload or a
 * dropped socket loses it, and the server has already freed the seat by then.
 */
export class TableSession {
  private socket: SocketLike | null = null;
  private seatToken: string | null = null;
  private wantsSeat: boolean;
  private sitPending = false;
  private closedByUser = false;
  private attempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private latest: TableSnapshot | null = null;

  constructor(
    private readonly options: {
      url: string;
      tableId: string;
      getAccessToken: GetAccessToken;
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
    this.open();
  }

  close(): void {
    this.closedByUser = true;
    this.stopPing();
    this.socket?.close();
    this.socket = null;
  }

  sit(): void {
    this.wantsSeat = true;
    void this.trySit();
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

  private open(): void {
    const factory = this.options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
    const socket = factory(this.options.url);
    this.socket = socket;
    this.seatToken = null;
    this.sitPending = false;
    this.options.onEvent({ type: 'status', status: 'connecting' });

    socket.onopen = () => {
      this.attempts = 0;
      this.options.onEvent({ type: 'status', status: 'open' });
      this.send({ action: 'join_table', tableId: this.options.tableId });
      this.startPing();
    };
    socket.onmessage = (event) => this.receive(parseMessage(event.data));
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.stopPing();
      this.socket = null;
      this.seatToken = null;
      this.options.onEvent({ type: 'status', status: 'closed' });
      if (!this.closedByUser && this.attempts < RECONNECT_DELAYS.length) {
        const delay = RECONNECT_DELAYS[this.attempts++]!;
        setTimeout(() => {
          if (!this.closedByUser) {
            this.open();
          }
        }, delay);
      }
    };
  }

  private receive(message: OutboundMessage | null): void {
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'table_snapshot':
        this.latest = message;
        this.options.onEvent({ type: 'snapshot', snapshot: message });
        if (this.wantsSeat && !this.seatToken && !message.you) {
          void this.trySit();
        }
        break;
      case 'sat':
        this.sitPending = false;
        this.seatToken = message.seatToken;
        this.options.onEvent({ type: 'sat', seatId: message.seatId });
        break;
      case 'left':
        this.seatToken = null;
        this.options.onEvent({ type: 'left' });
        break;
      case 'error':
        if (message.code === 'invalid_seat_token' || message.code === 'not_seated') {
          this.seatToken = null;
        }
        if (['table_full', 'seat_occupied', 'account_already_seated', 'already_seated', 'invalid_access_token', 'identity_unavailable'].includes(message.code)) {
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

  private async trySit(): Promise<void> {
    if (this.sitPending || this.seatToken || !this.latest) {
      return;
    }
    if (!this.latest.seats.some((seat) => !seat.occupied)) {
      return;
    }
    this.sitPending = true;
    const accessToken = await this.options.getAccessToken();
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

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ action: 'ping' }), PING_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
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
