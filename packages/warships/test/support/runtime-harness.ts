import { vi } from 'vitest';
import { createPlayerResolver } from '@galaxyclass/accounts/player-verifier';
import type { ServerMessage, ShotEvent, TableSnapshot } from '../../src/protocol.js';
import { seededRandom } from '../../src/rules/random.js';
import type { Coord, Fleet, SeatId } from '../../src/rules/types.js';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { MemoryWarshipsStore } from '../../src/runtime/memory-store.js';
import { newTableRecord } from '../../src/runtime/table-record.js';
import type { TableRecord } from '../../src/runtime/types.js';
import { signAccessToken, testAccessTokenVerifier } from './cognito-tokens.js';

export const TABLE_ID = '5d0f3a1b-9c2e-4b7a-8d6f-2e1c0b9a8f7e';

export const PROFILES: Record<string, { gamerTag: string; avatarId: number }> = {
  'sub-admiral': { gamerTag: 'Admiral', avatarId: 12 },
  'sub-ensign': { gamerTag: 'Ensign', avatarId: 30 },
};

export interface HarnessOptions {
  failCommits?: number;
  /** Who fires first at every table; `null` flips the (seeded) coin. Defaults to seat 1. */
  firstSeatId?: SeatId | null;
  seed?: number;
}

export class Harness {
  readonly store = new MemoryWarshipsStore();
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
    const first = options.firstSeatId === undefined ? '1' : options.firstSeatId;
    this.handler = createRuntimeHandler({
      store,
      resolvePlayer,
      random: seededRandom(options.seed ?? 42),
      now: () => this.now,
      startOptions: () => (first ? { firstSeatId: first } : undefined),
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
      ...newTableRecord({ tableId, createdAt: '2026-10-08T00:00:00.000Z', tableName: 'Pacific', createdBy: 'sub-admiral' }),
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

  shots(connectionId: string): ShotEvent[] {
    return this.messages(connectionId).filter((m): m is ShotEvent => m.type === 'shot');
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

  async place(connectionId: string, seatToken: string, fleet: Fleet) {
    await this.send(connectionId, { action: 'place_fleet', seatToken, fleet });
  }

  async fire(connectionId: string, seatToken: string, target: Coord) {
    await this.send(connectionId, { action: 'fire', seatToken, target });
  }

  table(tableId = TABLE_ID): TableRecord {
    return this.store.tables.get(tableId)!;
  }

  /** Moves the clock to the moment the current turn accepts a shot. */
  openTurn(tableId = TABLE_ID) {
    const opensAt = this.table(tableId).game.turnOpensAt;
    if (opensAt !== null && opensAt > this.now) {
      this.now = opensAt;
    }
  }

  /** Seats `a` (seat 1) and `b` (seat 2), places both fleets, and opens the first turn. */
  async battle(fleets: { a: Fleet; b: Fleet }): Promise<{ a: string; b: string }> {
    const a = await this.seat('a');
    const b = await this.seat('b');
    await this.place('a', a, fleets.a);
    await this.place('b', b, fleets.b);
    this.openTurn();
    return { a, b };
  }
}
