import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  playerResolverFromEnv,
  resolveSitIdentity,
  type ResolvePlayer,
} from '@galaxyclass/accounts/player-verifier';
import { cryptoRandom, type Random } from '../rules/bag.js';
import { loadDictionary, type Dictionary } from '../rules/dictionary.js';
import {
  dropSeat,
  exchange,
  leave,
  pass,
  play,
  setTheme,
  sit,
  start,
  type ActionContext,
  type ActionResult,
  type Change,
} from './actions.js';
import { createDynamoStore } from './dynamo-store.js';
import { createPostToConnection, fanOutSnapshots, isGoneError } from './fanout.js';
import { hasClientSuppliedState, parseClientMessage, parsePlacements, parseTileIds } from './messages.js';
import { buildSeatScopedSnapshot } from './snapshot.js';
import type { ScribbleStore } from './store.js';
import type { ConnectionRecord, ErrorMessage, OutboundMessage, PostToConnection, SeatRecord, WebSocketEvent } from './types.js';

export interface RuntimeDeps {
  store: ScribbleStore;
  postToConnection: PostToConnection;
  dictionary: Dictionary;
  /** Verifies Cognito access tokens on sit. Without it every sit is a guest sit. */
  resolvePlayer?: ResolvePlayer | null;
  random?: Random;
  startOptions?: ActionContext['startOptions'];
}

const LOG = { logTag: 'scribble' };
const MAX_COMMIT_ATTEMPTS = 3;
const MAX_LIST_TABLE_IDS = 32;

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
      const result = build({ table, seats, connection, random, startOptions: deps.startOptions });
      if (!result) {
        return;
      }
      if (!result.ok) {
        if (connectionId) {
          await send(connectionId, result.error);
        }
        return;
      }
      const committed = await deps.store.commit({ ...result.change, expectedVersion: table.version });
      if (!committed) {
        continue;
      }
      if (connectionId && result.reply) {
        await send(connectionId, result.reply);
      }
      await fanOutSnapshots(
        { store: deps.store, postToConnection: send },
        result.change.table,
        applyChange(seats, result.change),
      );
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
        await mutate(closing.tableId, null, ({ table, seats }) => {
          const seat = seats.find((s) => s.seatId === seatId);
          if (!seat || seat.connectionId !== connectionId) {
            return null;
          }
          return { ok: true, change: dropSeat(table, seats, seatId, random) };
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
      return { statusCode: 200 };
    }

    if (message.action === 'create_table') {
      await send(connectionId, error('unsupported_action'));
      return { statusCode: 200 };
    }

    if (message.action === 'list_tables') {
      const requested = Array.isArray(message.tableIds) ? message.tableIds : [];
      const ids = [...new Set(requested.filter((id): id is string => typeof id === 'string' && id !== ''))].slice(
        0,
        MAX_LIST_TABLE_IDS,
      );
      const tables = [];
      for (const tableId of ids) {
        const table = await deps.store.getTable(tableId);
        if (!table || !table.listed) {
          continue;
        }
        const seats = await deps.store.listSeats(tableId);
        tables.push({ tableId, seatedCount: seats.length, maxSeats: table.maxSeats, status: table.game.status });
      }
      await send(connectionId, { type: 'table_list', tables });
      return { statusCode: 200 };
    }

    if (hasClientSuppliedState(message)) {
      await send(connectionId, error('client_supplied_state'));
      return { statusCode: 200 };
    }

    if (message.action === 'join_table') {
      const tableId = typeof message.tableId === 'string' ? message.tableId : '';
      const table = tableId ? await deps.store.getTable(tableId) : null;
      if (!table) {
        await send(connectionId, error('table_not_found'));
        return { statusCode: 200 };
      }
      const connection = await deps.store.getConnection(connectionId);
      if (connection?.tableId === tableId) {
        const seats = await deps.store.listSeats(tableId);
        await send(connectionId, buildSeatScopedSnapshot(table, seats, connection));
        return { statusCode: 200 };
      }
      if (connection?.tableId && connection.seatId) {
        const previous = { tableId: connection.tableId, seatId: connection.seatId };
        await mutate(previous.tableId, connectionId, ({ table: prior, seats }) =>
          seats.some((s) => s.seatId === previous.seatId && s.connectionId === connectionId)
            ? { ok: true, change: dropSeat(prior, seats, previous.seatId, random, connectionId) }
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
        const identity = await resolveSitIdentity(message.accessToken, deps.resolvePlayer, LOG);
        if (!identity.ok) {
          await send(connectionId, error(identity.code));
          return { statusCode: 200 };
        }
        await mutate(tableId, connectionId, seatedAction(connection, (ctx) => sit(ctx, message.seatId, identity.player)));
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
      console.warn('[scribble] Cognito is not configured; every player sits as a guest.');
    }
    cached = { store: createDynamoStore(client, tableName), resolvePlayer, dictionary: loadDictionary() };
  }

  return createRuntimeHandler({
    ...cached,
    postToConnection: createPostToConnection(event, process.env.AWS_REGION),
  })(event);
}