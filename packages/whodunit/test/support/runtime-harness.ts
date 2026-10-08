import { vi } from 'vitest';
import { createPlayerResolver } from '@galaxyclass/accounts/player-verifier';
import type { EventMessage, ServerMessage, TableSnapshot } from '../../src/protocol.js';
import type { GameState } from '../../src/rules/game.js';
import { seededRandom } from '../../src/rules/random.js';
import type { SeatId, SuspectId } from '../../src/rules/types.js';
import type { StartOptions } from '../../src/runtime/actions.js';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { MemoryWhodunitStore } from '../../src/runtime/memory-store.js';
import { newTableRecord } from '../../src/runtime/table-record.js';
import type { TableRecord } from '../../src/runtime/types.js';
import { signAccessToken, testAccessTokenVerifier } from './cognito-tokens.js';

export const TABLE_ID = '6e1a4b2c-0d3f-4c8b-9e7a-3f2d1c0b9a8e';

export const PROFILES: Record<string, { gamerTag: string; avatarId: number }> = {
  'sub-inspector': { gamerTag: 'Inspector', avatarId: 12 },
  'sub-sleuth': { gamerTag: 'Sleuth', avatarId: 40 },
};

/** The suspects `setupCase` gives seats 1–6, in order. */
export const CAST: SuspectId[] = ['vesper', 'finch', 'juniper', 'rook', 'duarte', 'thorne'];

export interface HarnessOptions {
  failCommits?: number;
  /** Fixed parts of every case: by default seat 1 goes first and the rest is seeded. */
  startOptions?: StartOptions | null;
  seed?: number;
}

export class Harness {
  readonly store = new MemoryWhodunitStore();
  /** Every frame sent to each connection, serialized exactly as it would go over the wire. */
  readonly wire = new Map<string, string[]>();
  readonly handler;
  /** Epoch ms the runtime sees; move it with `advance`. */
  now = Date.parse('2026-10-08T12:00:00.000Z');

  constructor(options: HarnessOptions = {}) {
    const resolvePlayer = createPlayerResolver(testAccessTokenVerifier(), async (sub) => ({
      gamerTag: PROFILES[sub]?.gamerTag ?? null,
      avatarId: PROFILES[sub]?.avatarId ?? null,
    }));
    let failures = options.failCommits ?? 0;
    const store = this.store;
    const realCommit = store.commit.bind(store);
    store.commit = async (change) => {
      if (failures > 0) {
        failures--;
        const current = store.tables.get(change.table.tableId)!;
        store.tables.set(current.tableId, { ...current, version: current.version + 1 });
      }
      return realCommit(change);
    };
    const startOptions = options.startOptions === undefined ? { firstSeatId: '1' as const } : options.startOptions;
    this.handler = createRuntimeHandler({
      store,
      resolvePlayer,
      random: seededRandom(options.seed ?? 42),
      now: () => this.now,
      startOptions: () => startOptions ?? undefined,
      postToConnection: async (connectionId, message) => {
        if (!store.connections.has(connectionId)) {
          throw Object.assign(new Error('gone'), { name: 'GoneException' });
        }
        const frames = this.wire.get(connectionId) ?? [];
        frames.push(JSON.stringify(message));
        this.wire.set(connectionId, frames);
      },
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  advance(ms: number) {
    this.now += ms;
  }

  async seed(overrides: Partial<TableRecord> = {}, tableId = TABLE_ID): Promise<TableRecord> {
    const table = {
      ...newTableRecord({ tableId, createdAt: '2026-10-08T00:00:00.000Z', tableName: 'Starfall Manor', createdBy: 'sub-inspector' }),
      ...overrides,
    };
    await this.store.putTable(table);
    return table;
  }

  private event(routeKey: string, connectionId: string, body?: unknown) {
    return {
      requestContext: { routeKey, connectionId, domainName: 'example.test', stage: 'prod' },
      body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
    };
  }

  async connect(connectionId: string) {
    await this.handler(this.event('$connect', connectionId));
  }

  async disconnect(connectionId: string) {
    await this.handler(this.event('$disconnect', connectionId));
  }

  async send(connectionId: string, body: unknown) {
    await this.handler(this.event('$default', connectionId, body));
  }

  messages(connectionId: string): ServerMessage[] {
    return (this.wire.get(connectionId) ?? []).map((frame) => JSON.parse(frame) as ServerMessage);
  }

  last<T extends ServerMessage['type']>(connectionId: string, type: T): Extract<ServerMessage, { type: T }> {
    const found = this.messages(connectionId)
      .filter((message) => message.type === type)
      .at(-1);
    if (!found) {
      throw new Error(`${connectionId} received no ${type}`);
    }
    return found as Extract<ServerMessage, { type: T }>;
  }

  snapshot(connectionId: string): TableSnapshot {
    return this.last(connectionId, 'table_snapshot');
  }

  events(connectionId: string): EventMessage[] {
    return this.messages(connectionId).filter((m): m is EventMessage => m.type === 'event');
  }

  lastError(connectionId: string) {
    return this.messages(connectionId).at(-1);
  }

  /** A member access token for `sub-<connectionId>`, so each test connection is its own signed-in member. */
  tokenFor(connectionId: string): string {
    return signAccessToken({ sub: `sub-${connectionId}`, username: `sub-${connectionId}` });
  }

  async join(connectionId: string, tableId = TABLE_ID, accessToken: string = this.tokenFor(connectionId)) {
    await this.send(connectionId, { action: 'join_table', tableId, accessToken });
  }

  /** Connects, joins, and sits as a member (`sub-<connectionId>` unless `sit.accessToken` says otherwise). Returns the seat token. */
  async seat(connectionId: string, sit: Record<string, unknown> = {}, tableId = TABLE_ID): Promise<string> {
    const accessToken = typeof sit.accessToken === 'string' ? sit.accessToken : this.tokenFor(connectionId);
    await this.connect(connectionId);
    await this.join(connectionId, tableId, accessToken);
    await this.send(connectionId, { action: 'sit', ...sit, accessToken });
    return this.last(connectionId, 'sat').seatToken;
  }

  /** Sends a seat action with the connection's seat token. */
  async act(connectionId: string, action: string, extra: Record<string, unknown> = {}) {
    const seatToken = this.tokens.get(connectionId);
    await this.send(connectionId, { action, seatToken, ...extra });
  }

  /** Seat tokens of the connections `setupCase` seated. */
  readonly tokens = new Map<string, string>();

  table(tableId = TABLE_ID): TableRecord {
    return this.store.tables.get(tableId)!;
  }

  game(tableId = TABLE_ID): GameState {
    return this.table(tableId).game;
  }

  /** Rewrites the stored case directly, to stage a position the dice would take a while to reach. */
  patch(edit: (game: GameState) => Partial<GameState>, tableId = TABLE_ID) {
    const table = this.table(tableId);
    this.store.tables.set(tableId, { ...table, game: { ...table.game, ...edit(table.game) } });
  }

  /** Moves the clock to the moment the next case action is accepted. */
  openTurn(tableId = TABLE_ID) {
    const opensAt = this.table(tableId).game.nextActionAt;
    if (opensAt !== null && opensAt > this.now) {
      this.now = opensAt;
    }
  }

  /** The connection sitting in `seatId`. */
  connOf(seatId: SeatId): string {
    return [...this.tokens.keys()][Number(seatId) - 1]!;
  }

  /**
   * Seats `conns` in seats 1, 2, 3…, gives each the next suspect in CAST, readies everyone, and has
   * seat 1 (the host) open the case. Opens the first turn.
   */
  async setupCase(conns: string[] = ['a', 'b', 'c']): Promise<void> {
    for (const [i, conn] of conns.entries()) {
      this.tokens.set(conn, await this.seat(conn));
      await this.act(conn, 'choose_suspect', { suspect: CAST[i] });
      await this.act(conn, 'ready');
    }
    await this.act(conns[0]!, 'start_game');
    this.openTurn();
  }
}
