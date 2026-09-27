import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createPostToConnection, fanOutSeatScopedSnapshots } from './fanout.js';
import {
  hasClientSuppliedState,
  isUnsupportedGameplayAction,
  parseClientMessage,
} from './messages.js';
import { handleAct, isBettingAction } from './act.js';
import { handleSeatDisconnect } from './disconnect.js';
import { handleLeave, handleResumeSeat, handleSit } from './sit.js';
import { reapDepartedSeats } from './reap.js';
import { handleStartHand } from './start-hand.js';
import { createMatchStore, type MatchStore } from './store.js';
import type {
  ErrorMessage,
  LambdaContext,
  OutboundMessage,
  RuntimeEnv,
  WebSocketEvent,
} from './types.js';

export interface RuntimeDeps {
  store: MatchStore;
  postToConnection: (
    connectionId: string,
    message: OutboundMessage,
  ) => Promise<void>;
  now: () => string;
  rngSeed?: () => number;
}

function errorMessage(code: string): ErrorMessage {
  return { type: 'error', code };
}

export function createRuntimeHandler(deps: RuntimeDeps) {
  return async function handler(
    event: WebSocketEvent,
    _context: LambdaContext,
  ): Promise<{ statusCode: number; body?: string }> {
    const { routeKey, connectionId } = event.requestContext;

    if (routeKey === '$connect') {
      await deps.store.putConnection(connectionId);
      return { statusCode: 200 };
    }

    if (routeKey === '$disconnect') {
      const closing = await deps.store.getConnection(connectionId);
      await deps.store.deleteConnection(connectionId);
      if (closing?.tableId && closing.seatId) {
        const result = await handleSeatDisconnect(
          deps.store,
          closing.tableId,
          closing.seatId,
          connectionId,
          deps.now(),
        );
        if (result) {
          await fanOutSeatScopedSnapshots(
            { store: deps.store, postToConnection: deps.postToConnection },
            result.table,
            result.seats,
          );
        }
      }
      return { statusCode: 200 };
    }

    const message = parseClientMessage(event.body);
    if (!message) {
      await deps.postToConnection(
        connectionId,
        errorMessage('unsupported_action'),
      );
      return { statusCode: 200 };
    }

    if (message.action === 'ping') {
      return { statusCode: 200 };
    }

    if (message.action === 'create_table') {
      await deps.postToConnection(connectionId, errorMessage('unsupported_action'));
      return { statusCode: 200 };
    }

    if (message.action === 'join_table') {
      if (!message.tableId) {
        await deps.postToConnection(
          connectionId,
          errorMessage('unsupported_action'),
        );
        return { statusCode: 200 };
      }

      const existing = await deps.store.getTable(message.tableId);
      if (!existing) {
        await deps.postToConnection(connectionId, errorMessage('table_not_found'));
        return { statusCode: 200 };
      }

      await deps.store.bindConnectionToTable(connectionId, message.tableId);
      const current = await reapDepartedSeats(
        deps.store,
        existing,
        await deps.store.listSeats(message.tableId),
        deps.now(),
      );
      const updated = await deps.store.incrementTableVersion(
        message.tableId,
        current.table.version,
      );

      if (!updated) {
        await deps.postToConnection(
          connectionId,
          errorMessage('version_conflict'),
        );
        return { statusCode: 200 };
      }

      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        updated,
        current.seats,
      );
      return { statusCode: 200 };
    }

    const connection = await deps.store.getConnection(connectionId);
    if (!connection?.tableId) {
      await deps.postToConnection(connectionId, errorMessage('not_table_member'));
      return { statusCode: 200 };
    }

    const storedTable = await deps.store.getTable(connection.tableId);
    if (!storedTable) {
      await deps.postToConnection(connectionId, errorMessage('table_not_found'));
      return { statusCode: 200 };
    }

    const { table, seats, reaped } = await reapDepartedSeats(
      deps.store,
      storedTable,
      await deps.store.listSeats(connection.tableId),
      deps.now(),
    );
    if (reaped) {
      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        table,
        seats,
      );
    }

    if (message.action === 'sit') {
      if (hasClientSuppliedState(message)) {
        await deps.postToConnection(connectionId, errorMessage('client_supplied_state'));
        return { statusCode: 200 };
      }

      const result = await handleSit({
        store: deps.store,
        connection,
        table,
        seats,
        message,
      });

      if (!result.ok) {
        await deps.postToConnection(connectionId, errorMessage(result.code));
        return { statusCode: 200 };
      }

      await deps.postToConnection(connectionId, {
        type: 'sat',
        seatId: result.seatId,
        seatToken: result.seatToken,
      });
      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        result.table,
        result.seats,
      );
      return { statusCode: 200 };
    }

    if (message.action === 'resume_seat') {
      const result = await handleResumeSeat({
        store: deps.store,
        connection,
        table,
        seats,
        message,
      });

      if (!result.ok) {
        await deps.postToConnection(connectionId, errorMessage(result.code));
        return { statusCode: 200 };
      }

      await deps.postToConnection(connectionId, {
        type: 'sat',
        seatId: result.seatId,
        seatToken: result.seatToken,
      });
      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        result.table,
        result.seats,
      );
      return { statusCode: 200 };
    }

    if (message.action === 'leave') {
      const result = await handleLeave({
        store: deps.store,
        connection,
        table,
        seats,
        message,
        now: deps.now(),
      });

      if (!result.ok) {
        await deps.postToConnection(connectionId, errorMessage(result.code));
        return { statusCode: 200 };
      }

      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        result.table,
        result.seats,
      );
      return { statusCode: 200 };
    }

    if (message.action === 'start_hand') {
      if (hasClientSuppliedState(message)) {
        await deps.postToConnection(connectionId, errorMessage('client_supplied_state'));
        return { statusCode: 200 };
      }

      const result = await handleStartHand({
        store: deps.store,
        connection,
        table,
        seats,
        message,
        rngSeed: deps.rngSeed?.(),
      });

      if (!result.ok) {
        await deps.postToConnection(connectionId, errorMessage(result.code));
        return { statusCode: 200 };
      }

      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        result.table,
        result.seats,
      );
      return { statusCode: 200 };
    }

    if (isBettingAction(message.action)) {
      if (hasClientSuppliedState(message)) {
        await deps.postToConnection(connectionId, errorMessage('client_supplied_state'));
        return { statusCode: 200 };
      }

      const result = await handleAct({
        store: deps.store,
        connection,
        table,
        seats,
        message,
      });

      if (!result.ok) {
        await deps.postToConnection(connectionId, errorMessage(result.code));
        return { statusCode: 200 };
      }

      await fanOutSeatScopedSnapshots(
        { store: deps.store, postToConnection: deps.postToConnection },
        result.table,
        result.seats,
      );
      return { statusCode: 200 };
    }

    if (isUnsupportedGameplayAction(message.action)) {
      await deps.postToConnection(
        connectionId,
        errorMessage('unsupported_action'),
      );
      return { statusCode: 200 };
    }

    await deps.postToConnection(connectionId, errorMessage('unsupported_action'));
    return { statusCode: 200 };
  };
}

function readEnv(): RuntimeEnv {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME is required');
  }

  return {
    tableName,
    awsRegion: process.env.AWS_REGION,
  };
}

let cachedStore: MatchStore | undefined;
let cachedEnv: RuntimeEnv | undefined;

export async function handler(
  event: WebSocketEvent,
  context: LambdaContext,
): Promise<{ statusCode: number; body?: string }> {
  if (!cachedStore || !cachedEnv) {
    cachedEnv = readEnv();
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
    cachedStore = createMatchStore(client, cachedEnv);
  }

  const runtimeHandler = createRuntimeHandler({
    store: cachedStore,
    postToConnection: createPostToConnection(event, cachedEnv.awsRegion),
    now: () => new Date().toISOString(),
  });

  return runtimeHandler(event, context);
}
