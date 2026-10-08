import type {
  CardId,
  Destination,
  ErrorMessage,
  EventMessage,
  MemberReply,
  RoomId,
  ServerMessage,
  SuspectId,
  TableSnapshot,
  WeaponId,
} from '../protocol.js';
import { tokenSubject, type GetAccessToken } from './player-token.js';

export type { MemberReply };

export type SessionEvent =
  | { type: 'status'; status: 'connecting' | 'open' | 'closed' }
  | { type: 'snapshot'; snapshot: TableSnapshot }
  | { type: 'event'; message: EventMessage }
  | { type: 'pong'; serverTs: number; sentAt: number; receivedAt: number }
  | { type: 'error'; error: ErrorMessage }
  | { type: 'sat'; seatId: string }
  | { type: 'left'; reason?: 'taken_over' }
  | { type: 'deleted' };

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type SocketFactory = (url: string) => SocketLike;

export const defaultSocketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

/** Errors after which auto-sit stops until the detective asks again. */
const STOP_SITTING = new Set([
  'table_full',
  'seat_occupied',
  'already_seated',
  'table_locked',
  'sign_in_required',
  'invalid_access_token',
  'identity_unavailable',
]);

/**
 * Where this table's seat token survives a reload, a closed tab, or a sleeping laptop. Keyed by
 * member, so two accounts signed in to tabs of one browser profile each keep their own seat.
 */
export interface SeatTokenStore {
  get(member: string): string | null;
  set(member: string, token: string): void;
  clear(member: string): void;
}

/** Resume failures that mean the stored token will never work again for this member. */
const STALE_RESUME = new Set(['invalid_seat_token', 'already_seated', 'seat_not_yours']);

const OPEN = 1;
const KEEPALIVE_MS = 4 * 60 * 1000;
/** Clock samples during a case, so a drifting laptop clock never desyncs the animations. */
const PLAYING_PING_MS = 60 * 1000;
/** Pings sent right after opening; the best of them seeds the clock offset. */
const CALIBRATION_PINGS = 3;
const CALIBRATION_GAP_MS = 400;
/** A socket that has not answered a ping by now is treated as dead (common after sleep). */
const PONG_TIMEOUT_MS = 8000;
/** Retries never stop; the last delay repeats. */
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

export function parseMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const value = JSON.parse(data) as unknown;
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
      ? (value as ServerMessage)
      : null;
  } catch {
    return null;
  }
}

/** Only the fields the server reads, whatever the caller passed in. */
function cleanDestination(to: Destination): Destination {
  return to.kind === 'room' ? { kind: 'room', room: to.room } : { kind: 'hall', x: to.x, y: to.y };
}

/**
 * One table connection. The server holds a seat while its detective is away during setup or a
 * case; the seat token kept in `seatStore` takes it back from any later connection, and the same
 * account can also take it back by signing in. Only an explicit leave gives the seat up.
 */
export class TableSession {
  private socket: SocketLike | null = null;
  private seatToken: string | null = null;
  /** The signed-in member's `sub`, from the last access token; scopes the stored seat token. */
  private member: string | null = null;
  private wantsSeat: boolean;
  private lockedOut = false;
  private sitPending = false;
  private resumePending = false;
  private closedByUser = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private playingPingTimer: ReturnType<typeof setInterval> | null = null;
  private calibrationTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  /** Send times of pings still waiting for their pong, oldest first. */
  private pingsInFlight: number[] = [];
  private calibrationLeft = 0;
  private latest: TableSnapshot | null = null;
  private readonly now: () => number;

  constructor(
    private readonly options: {
      url: string;
      tableId: string;
      getAccessToken: GetAccessToken;
      seatStore?: SeatTokenStore;
      socketFactory?: SocketFactory;
      autoSit?: boolean;
      now?: () => number;
      onEvent: (event: SessionEvent) => void;
    },
  ) {
    this.wantsSeat = options.autoSit ?? true;
    this.now = options.now ?? Date.now;
  }

  get seated(): boolean {
    return this.seatToken !== null;
  }

  /** The signed-in member's unverified `sub`; keys notes kept in this browser. */
  get memberId(): string | null {
    return this.member;
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
    this.lockedOut = false;
    this.sendSeated({ action: 'leave' });
  }

  chooseSuspect(suspect: SuspectId): void {
    this.sendSeated({ action: 'choose_suspect', suspect });
  }

  ready(): void {
    this.sendSeated({ action: 'ready' });
  }

  unready(): void {
    this.sendSeated({ action: 'unready' });
  }

  startGame(): void {
    this.sendSeated({ action: 'start_game' });
  }

  roll(): void {
    this.sendSeated({ action: 'roll' });
  }

  takePassage(): void {
    this.sendSeated({ action: 'take_passage' });
  }

  move(to: Destination): void {
    this.sendSeated({ action: 'move', to: cleanDestination(to) });
  }

  suggest(suspect: SuspectId, weapon: WeaponId): void {
    this.sendSeated({ action: 'suggest', suspect, weapon });
  }

  showCard(card: CardId): void {
    this.sendSeated({ action: 'show_card', card });
  }

  accuse(suspect: SuspectId, weapon: WeaponId, room: RoomId): void {
    this.sendSeated({ action: 'accuse', suspect, weapon, room });
  }

  endTurn(): void {
    this.sendSeated({ action: 'end_turn' });
  }

  newGame(): void {
    this.sendSeated({ action: 'new_game' });
  }

  claimAbandoned(): void {
    this.sendSeated({ action: 'claim_abandoned' });
  }

  private open(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const factory = this.options.socketFactory ?? defaultSocketFactory;
    const socket = factory(this.options.url);
    this.socket = socket;
    this.seatToken = null;
    this.sitPending = false;
    this.resumePending = false;
    this.pingsInFlight = [];
    this.options.onEvent({ type: 'status', status: 'connecting' });

    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.attempts = 0;
      this.options.onEvent({ type: 'status', status: 'open' });
      this.calibrationLeft = CALIBRATION_PINGS;
      this.ping();
      void this.join(socket);
      this.startKeepalive();
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

  /** Tables are members-only: the server will not even show one without a verified sign-in. */
  private async join(socket: SocketLike): Promise<void> {
    const accessToken = await this.options.getAccessToken();
    if (this.socket !== socket) {
      return;
    }
    if (!accessToken) {
      this.member = null;
      this.wantsSeat = false;
      this.options.onEvent({ type: 'error', error: { type: 'error', code: 'sign_in_required' } });
      return;
    }
    this.member = tokenSubject(accessToken);
    this.send({ action: 'join_table', tableId: this.options.tableId, accessToken });
  }

  private storedSeatToken(): string | null {
    return this.member ? (this.options.seatStore?.get(this.member) ?? null) : null;
  }

  private storeSeatToken(token: string): void {
    if (this.member) {
      this.options.seatStore?.set(this.member, token);
    }
  }

  private clearSeatToken(): void {
    if (this.member) {
      this.options.seatStore?.clear(this.member);
    }
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

  private receive(message: ServerMessage | null): void {
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'table_snapshot':
        this.latest = message;
        if (this.lockedOut && (message.status === 'setup' || message.status === 'finished')) {
          this.lockedOut = false;
          this.wantsSeat = true;
        }
        this.syncPlayingPing(message.status === 'playing');
        this.options.onEvent({ type: 'snapshot', snapshot: message });
        if (!this.seatToken && !message.you) {
          this.claimSeat();
        }
        break;
      case 'event':
        if (message.tableId === this.options.tableId) {
          this.options.onEvent({ type: 'event', message });
        }
        break;
      case 'pong': {
        const sentAt = this.pingsInFlight.shift();
        if (sentAt !== undefined) {
          this.options.onEvent({ type: 'pong', serverTs: message.serverTs, sentAt, receivedAt: this.now() });
        }
        if (this.calibrationLeft > 0) {
          this.calibrationTimer = setTimeout(() => {
            this.calibrationTimer = null;
            this.ping();
          }, CALIBRATION_GAP_MS);
        }
        break;
      }
      case 'sat':
        this.sitPending = false;
        this.resumePending = false;
        this.seatToken = message.seatToken;
        this.storeSeatToken(message.seatToken);
        this.options.onEvent({ type: 'sat', seatId: message.seatId });
        break;
      case 'left':
        this.seatToken = null;
        if (message.reason === 'taken_over') {
          // Another window has the seat now; trying to take it back would bounce it between them.
          this.wantsSeat = false;
        } else {
          this.clearSeatToken();
        }
        this.options.onEvent({ type: 'left', ...(message.reason ? { reason: message.reason } : {}) });
        break;
      case 'table_deleted':
        if (message.tableId !== this.options.tableId) {
          break;
        }
        this.seatToken = null;
        this.wantsSeat = false;
        this.clearSeatToken();
        this.close();
        this.options.onEvent({ type: 'deleted' });
        break;
      case 'error':
        if (this.resumePending && STALE_RESUME.has(message.code)) {
          // The held seat is gone (cleared as abandoned, the detective left) or was never this
          // member's. Sit fresh instead; the server hands back a seat this account already holds.
          this.resumePending = false;
          this.clearSeatToken();
          this.claimSeat();
          return;
        }
        if (message.code === 'invalid_seat_token' || message.code === 'not_seated') {
          this.seatToken = null;
        }
        if (STOP_SITTING.has(message.code)) {
          this.sitPending = false;
          if (message.code !== 'already_seated') {
            this.wantsSeat = false;
          }
          // Arrived mid-case: show the notice now, and take a seat once that case is closed.
          this.lockedOut = message.code === 'table_locked';
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
    const stored = this.storedSeatToken();
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
    if (!accessToken) {
      this.sitPending = false;
      this.wantsSeat = false;
      this.options.onEvent({ type: 'error', error: { type: 'error', code: 'sign_in_required' } });
      return;
    }
    // Even at a full or locked table, the account may already hold a seat; the server hands it back.
    this.send({ action: 'sit', accessToken });
  }

  private sendSeated(message: Record<string, unknown>): void {
    if (!this.seatToken) {
      this.options.onEvent({ type: 'error', error: { type: 'error', code: 'not_seated' } });
      return;
    }
    this.send({ ...message, seatToken: this.seatToken });
  }

  private send(message: Record<string, unknown>): boolean {
    if (this.socket && this.socket.readyState === OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  private ping(): void {
    if (this.calibrationLeft > 0) {
      this.calibrationLeft--;
    }
    if (this.send({ action: 'ping' })) {
      this.pingsInFlight.push(this.now());
    }
  }

  /** Liveness check; its pong also feeds the clock. */
  private probe(): void {
    const socket = this.socket;
    if (!socket || this.pongTimer) {
      return;
    }
    this.ping();
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

  private startKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
    }
    this.keepaliveTimer = setInterval(() => this.probe(), KEEPALIVE_MS);
  }

  private syncPlayingPing(playing: boolean): void {
    if (playing && !this.playingPingTimer) {
      this.playingPingTimer = setInterval(() => this.ping(), PLAYING_PING_MS);
    } else if (!playing && this.playingPingTimer) {
      clearInterval(this.playingPingTimer);
      this.playingPingTimer = null;
    }
  }

  private stopTimers(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.playingPingTimer) {
      clearInterval(this.playingPingTimer);
      this.playingPingTimer = null;
    }
    if (this.calibrationTimer) {
      clearTimeout(this.calibrationTimer);
      this.calibrationTimer = null;
    }
    this.calibrationLeft = 0;
    this.clearPong();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

const MEMBER_REPLY_TYPES = new Set(['my_tables', 'table_created', 'table_forgotten', 'table_deleted', 'error']);

/** Sends one member action on a short-lived socket and resolves with the reply, or null when it never comes. */
export function memberRequest(
  url: string,
  message: Record<string, unknown>,
  socketFactory: SocketFactory = defaultSocketFactory,
  timeoutMs = 8000,
): Promise<MemberReply | null> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = socketFactory(url);
    const finish = (value: MemberReply | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.close();
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.onopen = () => socket.send(JSON.stringify(message));
    socket.onmessage = (event) => {
      const reply = parseMessage(event.data);
      if (reply && MEMBER_REPLY_TYPES.has(reply.type)) {
        finish(reply as MemberReply);
      }
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}
