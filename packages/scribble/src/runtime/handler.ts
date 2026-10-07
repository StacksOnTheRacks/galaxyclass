import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  playerResolverFromEnv,
  resolveMemberIdentity,
  type ResolvePlayer,
} from '@galaxyclass/accounts/player-verifier';
import { cryptoRandom, type Random } from '../rules/bag.js';
import { loadDictionary, type Dictionary } from '../rules/dictionary.js';
import {
  disconnectSeat,
  exchange,
  leave,
  pass,
  play,
  removeAway,
  resume,
  setTheme,
  sit,
  start,
  type ActionContext,
  type ActionResult,
  type Change,
} from './actions.js';
import { createDynamoStore } from './dynamo-store.js';
import { createPostToConnection, fanOutSnapshots, isGoneError } from './fanout.js';
import { hasClientSuppliedState, parseClientMessage, parsePlacements, parseTileIds, parseWords } from './messages.js';
import { stampGame } from './recap.js';
import { buildSeatScopedSnapshot } from './snapshot.js';
import type { ScribbleStore } from './store.js';
import { createMemberTable, deleteHostedTable, forgetMemberTable, joinAsMember, listMemberTables } from './tables.js';
import type { ConnectionRecord, ErrorMessage, OutboundMessage, PostToConnection, SeatRecord, WebSocketEvent } from './types.js';

export interface RuntimeDeps {
  store: ScribbleStore;
  postToConnection: PostToConnection;
  dictionary: Dictionary;
  /** Verifies Cognito access tokens. Scribble is members-only, so without it no one can open a table. */
  resolvePlayer?: ResolvePlayer | null;
  random?: Random;
  /** Epoch milliseconds; tests pin it to cross the away grace period. */
  now?: () => number;
  startOptions?: ActionContext['startOptions'];
  newTableId?: () => string;
}

const LOG = { logTag: 'scribble' };
const MAX_COMMIT_ATTEMPTS = 3;

function error(code: string): ErrorMessage {
  return { type: 'error', code };
}

function applyChange(seats: SeatRecord[], change: Change): SeatRecord[] {
  const removed = new Set(change.deleteSeatIds);
  const byId = new Map(seats.filter((seat) => !removed.has(seat.seatId)).map((seat) => [seat.seatId, seat]));
  for (const seat of change.putSeats) {
    byId.set(seat.seatId, seat);
  }
  return [...byId.values()].sort((a, b) => Number(a.seatId) - Number(b.seatId));
}

export function createRuntimeHandler(deps: RuntimeDeps) {
  const random = deps.random ?? cryptoRandom;
  const now = deps.now ?? Date.now;

  const send = async (connectionId: string, message: OutboundMessage): Promise<void> => {
    try {
      await deps.postToConnection(connectionId, message);
    } catch (err) {
      if (!isGoneError(err)) {
        throw err;
      }
      await deps.store.deleteConnection(connectionId);
    }
  };

  /**
   * Loads the table fresh, builds the change, and commits it conditioned on the version it read.
   * A concurrent write makes the commit fail; the action is rebuilt from the newer state.
   */
  const mutate = async (
    tableId: string,
    connectionId: string | null,
    build: (ctx: Omit<ActionContext, 'connection'> & { connection: ConnectionRecord | null }) => ActionResult | null,
  ): Promise<void> => {
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
      const table = await deps.store.getTable(tableId);
      if (!table) {
        if (connectionId) {
          await send(connectionId, error('table_not_found'));
        }
        return;
      }
      const seats = await deps.store.listSeats(tableId);
      const connection = connectionId ? await deps.store.getConnection(connectionId) : null;
      const at = now();
      const result = build({ table, seats, connection, random, now: at, startOptions: deps.startOptions });
      if (!result) {
        return;
      }
      if (!result.ok) {
        if (connectionId) {
          await send(connectionId, result.error);
        }
        return;
      }
      const seatsAfter = applyChange(seats, result.change);
      const change = { ...result.change, table: stampGame(table, result.change.table, seatsAfter, at) };
      const committed = await deps.store.commit({ ...change, expectedVersion: table.version });
      if (!committed) {
        continue;
      }
      if (connectionId && result.reply) {
        await send(connectionId, result.reply);
      }
      for (const { connectionId: other, message } of result.notify ?? []) {
        await send(other, message);
      }
      await fanOutSnapshots({ store: deps.store, postToConnection: send }, change.table, seatsAfter);
      return;
    }
    if (connectionId) {
      await send(connectionId, error('version_conflict'));
    }
  };

  const seatedAction =
    (connection: ConnectionRecord, act: (ctx: ActionContext) => ActionResult) =>
    (ctx: Omit<ActionContext, 'connection'> & { connection: ConnectionRecord | null }): ActionResult =>
      act({ ...ctx, connection: ctx.connection ?? connection });

  return async function handler(event: WebSocketEvent): Promise<{ statusCode: number }> {
    const { routeKey, connectionId } = event.requestContext;

    if (routeKey === '$connect') {
      await deps.store.putConnection(connectionId);
      return { statusCode: 200 };
    }

    if (routeKey === '$disconnect') {
      const closing = await deps.store.getConnection(connectionId);
      await deps.store.deleteConnection(connectionId);
      if (closing?.tableId && closing.seatId) {
        const seatId = closing.seatId;
        await mutate(closing.tableId, null, ({ table, seats, now: at }) => {
          const seat = seats.find((s) => s.seatId === seatId);
          if (!seat || seat.connectionId !== connectionId) {
            return null;
          }
          return { ok: true, change: disconnectSeat(table, seats, seatId, random, at) };
        });
      }
      return { statusCode: 200 };
    }

    const message = parseClientMessage(event.body);
    if (!message) {
      await send(connectionId, error('unsupported_action'));
      return { statusCode: 200 };
    }

    if (message.action === 'ping') {
      // The client treats a missing pong as a dead socket (a laptop that slept) and reconnects.
      await send(connectionId, { type: 'pong' });
      return { statusCode: 200 };
    }

    if (hasClientSuppliedState(message)) {
      await send(connectionId, error('client_supplied_state'));
      return { statusCode: 200 };
    }

    if (
      message.action === 'list_my_tables' ||
      message.action === 'create_table' ||
      message.action === 'forget_table' ||
      message.action === 'delete_table'
    ) {
      const identity = await resolveMemberIdentity(message.accessToken, deps.resolvePlayer, LOG);
      if (!identity.ok) {
        await send(connectionId, error(identity.code));
        return { statusCode: 200 };
      }
      const { player } = identity;
      if (message.action === 'list_my_tables') {
        await send(connectionId, {
          type: 'my_tables',
          you: { gamerTag: player.gamerTag, avatarId: player.avatarId },
          tables: await listMemberTables(deps.store, player.sub),
        });
      } else if (message.action === 'create_table') {
        const created = await createMemberTable(deps.store, player, message.tableName, now(), deps.newTableId);
        await send(connectionId, created.ok ? { type: 'table_created', table: created.value } : error(created.code));
      } else if (message.action === 'delete_table') {
        const deleted = await deleteHostedTable(deps.store, player.sub, message.tableId);
        if (!deleted.ok) {
          await send(connectionId, error(deleted.code));
          return { statusCode: 200 };
        }
        const notice: OutboundMessage = { type: 'table_deleted', tableId: deleted.value.tableId };
        for (const watcher of deleted.value.connectionIds) {
          if (watcher !== connectionId) {
            await send(watcher, notice);
          }
        }
        await send(connectionId, notice);
      } else {
        const forgotten = await forgetMemberTable(deps.store, player.sub, message.tableId);
        await send(
          connectionId,
          forgotten.ok ? { type: 'table_forgotten', tableId: forgotten.value } : error(forgotten.code),
        );
      }
      return { statusCode: 200 };
    }

    if (message.action === 'join_table') {
      const identity = await resolveMemberIdentity(message.accessToken, deps.resolvePlayer, LOG);
      if (!identity.ok) {
        await send(connectionId, error(identity.code));
        return { statusCode: 200 };
      }
      const tableId = typeof message.tableId === 'string' ? message.tableId : '';
      const table = tableId ? await deps.store.getTable(tableId) : null;
      if (!table) {
        await send(connectionId, error('table_not_found'));
        return { statusCode: 200 };
      }
      await joinAsMember(deps.store, identity.player.sub, table, now());
      const connection = await deps.store.getConnection(connectionId);
      if (connection?.tableId === tableId) {
        const seats = await deps.store.listSeats(tableId);
        await send(connectionId, buildSeatScopedSnapshot(table, seats, connection));
        return { statusCode: 200 };
      }
      if (connection?.tableId && connection.seatId) {
        const previous = { tableId: connection.tableId, seatId: connection.seatId };
        await mutate(previous.tableId, connectionId, ({ table: prior, seats, now: at }) =>
          seats.some((s) => s.seatId === previous.seatId && s.connectionId === connectionId)
            ? { ok: true, change: disconnectSeat(prior, seats, previous.seatId, random, at) }
            : null,
        );
      }
      await deps.store.bindConnectionToTable(connectionId, tableId);
      const seats = await deps.store.listSeats(tableId);
      await send(connectionId, buildSeatScopedSnapshot(table, seats, { connectionId, tableId }));
      return { statusCode: 200 };
    }

    const connection = await deps.store.getConnection(connectionId);
    if (!connection?.tableId) {
      await send(connectionId, error('not_table_member'));
      return { statusCode: 200 };
    }
    const tableId = connection.tableId;

    switch (message.action) {
      case 'sit': {
        const identity = await resolveMemberIdentity(message.accessToken, deps.resolvePlayer, LOG);
        if (!identity.ok) {
          await send(connectionId, error(identity.code));
          return { statusCode: 200 };
        }
        await mutate(tableId, connectionId, seatedAction(connection, (ctx) => sit(ctx, message.seatId, identity.player)));
        break;
      }
      case 'resume':
        await mutate(tableId, connectionId, seatedAction(connection, (ctx) => resume(ctx, message.seatToken)));
        break;
      case 'remove_player':
        await mutate(
          tableId,
          connectionId,
          seatedAction(connection, (ctx) => removeAway(ctx, message.seatToken, message.seatId)),
        );
        break;
      case 'check_words': {
        const words = parseWords(message.words);
        if (!words) {
          await send(connectionId, error('invalid_words'));
          break;
        }
        await send(connectionId, {
          type: 'word_check',
          words: words.map((text) => ({ text, valid: deps.dictionary.has(text) })),
        });
        break;
      }
      case 'leave':
        await mutate(tableId, connectionId, seatedAction(connection, (ctx) => leave(ctx, message.seatToken)));
        break;
      case 'start_game':
        await mutate(tableId, connectionId, seatedAction(connection, (ctx) => start(ctx, message.seatToken)));
        break;
      case 'play': {
        const placements = parsePlacements(message.placements);
        await mutate(
          tableId,
          connectionId,
          seatedAction(connection, (ctx) => play(ctx, message.seatToken, placements, deps.dictionary)),
        );
        break;
      }
      case 'pass':
        await mutate(tableId, connectionId, seatedAction(connection, (ctx) => pass(ctx, message.seatToken)));
        break;
      case 'exchange': {
        const tileIds = parseTileIds(message.tileIds);
        await mutate(
          tableId,
          connectionId,
          seatedAction(connection, (ctx) => exchange(ctx, message.seatToken, tileIds)),
        );
        break;
      }
      case 'set_theme':
        await mutate(
          tableId,
          connectionId,
          seatedAction(connection, (ctx) => setTheme(ctx, message.seatToken, message.themeId)),
        );
        break;
      default:
        await send(connectionId, error('unsupported_action'));
    }
    return { statusCode: 200 };
  };
}

let cached: { store: ScribbleStore; resolvePlayer: ResolvePlayer | null; dictionary: Dictionary } | undefined;

export async function handler(event: WebSocketEvent): Promise<{ statusCode: number }> {
  if (!cached) {
    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error('TABLE_NAME is required');
    }
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
    const resolvePlayer = playerResolverFromEnv(
      {
        userPoolId: process.env.COGNITO_USER_POOL_ID,
        clientId: process.env.COGNITO_CLIENT_ID,
        profileTableName: process.env.PROFILE_TABLE_NAME,
      },
      client,
      LOG,
    );
    if (!resolvePlayer) {
      console.error('[scribble] Cognito is not configured; members-only tables will refuse everyone.');
    }
    cached = { store: createDynamoStore(client, tableName), resolvePlayer, dictionary: loadDictionary() };
  }

  return createRuntimeHandler({
    ...cached,
    postToConnection: createPostToConnection(event, process.env.AWS_REGION),
  })(event);
}