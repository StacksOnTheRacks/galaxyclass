import { vi } from 'vitest';
import { createPlayerResolver } from '@galaxyclass/accounts/player-verifier';
import { seededRandom } from '../../src/rules/bag.js';
import { loadDictionary } from '../../src/rules/dictionary.js';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { MemoryScribbleStore } from '../../src/runtime/memory-store.js';
import { newTableRecord } from '../../src/runtime/table-record.js';
import type { OutboundMessage, TableRecord, TableSnapshot } from '../../src/runtime/types.js';
import { tiles } from './game-fixtures.js';
import { testAccessTokenVerifier } from './cognito-tokens.js';

export const TABLE_ID = '6f1d2c4e-8b3a-4d5f-9e7c-1a2b3c4d5e6f';

export const PROFILES: Record<string, { gamerTag: string; avatarId: number }> = {
  'sub-word-smith': { gamerTag: 'WordSmith', avatarId: 12 },
  'sub-ink-blot': { gamerTag: 'InkBlot', avatarId: 30 },
};

export class Harness {
  readonly store = new MemoryScribbleStore();
  /** Every frame sent to each connection, serialized exactly as it would go over the wire. */
  readonly wire = new Map<string, string[]>();
  readonly handler;

  constructor(options: { failCommits?: number } = {}) {
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
        return realCommit(change);
      }
      return realCommit(change);
    };
    this.handler = createRuntimeHandler({
      store,
      dictionary: loadDictionary(),
      resolvePlayer,
      random: seededRandom(42),
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

  async seed(overrides: Partial<TableRecord> = {}, tableId = TABLE_ID): Promise<TableRecord> {
    const table = { ...newTableRecord({ tableId, createdAt: '2026-10-04T00:00:00.000Z', tableName: 'Inkwell' }), ...overrides };
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

  messages(connectionId: string): OutboundMessage[] {
    return (this.wire.get(connectionId) ?? []).map((frame) => JSON.parse(frame) as OutboundMessage);
  }

  last<T extends OutboundMessage['type']>(connectionId: string, type: T): Extract<OutboundMessage, { type: T }> {
    const found = this.messages(connectionId)
      .filter((message) => message.type === type)
      .at(-1);
    if (!found) {
      throw new Error(`${connectionId} received no ${type}`);
    }
    return found as Extract<OutboundMessage, { type: T }>;
  }

  snapshot(connectionId: string): TableSnapshot {
    return this.last(connectionId, 'table_snapshot');
  }

  lastError(connectionId: string) {
    return this.messages(connectionId).at(-1);
  }

  /** Connects, joins, and sits. Returns the seat token. */
  async seat(connectionId: string, sit: Record<string, unknown> = {}, tableId = TABLE_ID): Promise<string> {
    await this.connect(connectionId);
    await this.send(connectionId, { action: 'join_table', tableId });
    await this.send(connectionId, { action: 'sit', ...sit });
    return this.last(connectionId, 'sat').seatToken;
  }

  /** Replaces a seat's rack directly in the store, as if the bag had dealt it. */
  rigRack(seatId: string, letters: string, tableId = TABLE_ID) {
    const seat = this.store.seats.get(tableId)!.get(seatId)!;
    seat.rack = tiles(letters, `rig${seatId}`);
  }

  rigGame(update: (table: TableRecord) => void, tableId = TABLE_ID) {
    update(this.store.tables.get(tableId)!);
  }

  rackIds(seatId: string, tableId = TABLE_ID): string[] {
    return this.store.seats.get(tableId)!.get(seatId)!.rack.map((tile) => tile.id);
  }

  tileId(seatId: string, letter: string | null, skip = 0, tableId = TABLE_ID): string {
    const matches = this.store.seats.get(tableId)!.get(seatId)!.rack.filter((tile) => tile.letter === letter);
    return matches[skip]!.id;
  }
}
