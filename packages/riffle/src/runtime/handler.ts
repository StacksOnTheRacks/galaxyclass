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
import { continueAfterHand, dealIfReady, isHandComplete, NEXT_HAND_DELAY_MS } from './auto-deal.js';
import { playerResolverFromEnv, type ResolvePlayer, type VerifiedPlayer } from './player-identity.js';
import { createMatchStore, type MatchStore } from './store.js';
import type {
  ClientMessage,
  ErrorMessage,
  LambdaContext,
  OutboundMessage,
  RuntimeEnv,
  SeatRecord,
  TableRecord,
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
  /** Pause before the next hand is dealt. `null` leaves finished hands for the caller to advance. */
  nextHandDelayMs?: number | null;
  /** Verifies Cognito access tokens on sit. Without it every sit is a guest sit. */
  resolvePlayer?: ResolvePlayer | null;
  /** Picks guest names and avatars. Defaults to Math.random. */
  random?: () => number;
}

function errorMessage(code: string): ErrorMessage {
  return { type: 'error', code };
}

type SitIdentity = { ok: true; player: VerifiedPlayer | null } | { ok: false; code: string };

/** A supplied token must verify; it never silently becomes a guest sit. */
async function resolveSitIdentity(
  message: ClientMessage,
  resolvePlayer: ResolvePlayer | null | undefined,
): Promise<SitIdentity> {
  if (message.accessToken === undefined) {
    return { ok: true, player: null };
  }
  if (typeof message.accessToken !== 'string' || !message.accessToken || !resolvePlayer) {
    return { ok: false, code: 'invalid_access_token' };
  }
  try {
    const player = await resolvePlayer(message.accessToken);
    return player ? { ok: true, player } : { ok: false, code: 'invalid_access_token' };
  } catch {
    return { ok: false, code: 'identity_unavailable' };
  }
}

const MAX_LIST_TABLE_IDS = 32;

function parseRequestedTableIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    ids.push(entry);
    if (ids.length >= MAX_LIST_TABLE_IDS) {
      break;
    }
  }
  return ids;
}

export function createRuntimeHandler(deps: RuntimeDeps) {
  const nextHandDelayMs =
    deps.nextHandDelayMs === undefined ? NEXT_HAND_DELAY_MS : deps.nextHandDelayMs;

  const afterUpdate = async (table: TableRecord, seats: SeatRecord[]): Promise<void> => {
    await fanOutSeatScopedSnapshots(deps, table, seats);
    if (isHandComplete(table)) {
      if (nextHandDelayMs !== null) {
        await continueAfterHand(deps, table.tableId, table.handNumber, nextHandDelayMs);
      }
      return;
    }
    await dealIfReady(deps, table, seats);
  };

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
          await afterUpdate(result.table, result.seats);
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

    if (message.action === 'list_tables') {
      const tables = [];
      for (const tableId of parseRequestedTableIds(message.tableIds)) {
        const table = await deps.store.getTable(tableId);
        if (!table) {
          continue;
        }
        const seats = await deps.store.listSeats(tableId);
        tables.push({
          tableId,
          seatedCount: seats.filter((seat) => seat.displayName).length,
          maxSeats: table.maxSeats,
        });
      }
      await deps.postToConnection(connectionId, { type: 'table_list', tables });
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

      const identity = await resolveSitIdentity(message, deps.resolvePlayer);
      if (!identity.ok) {
        await deps.postToConnection(connectionId, errorMessage(identity.code));
        return { statusCode: 200 };
      }

      const result = await handleSit({
        store: deps.store,
        connection,
        table,
        seats,
        message,
        player: identity.player,
        random: deps.random,
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
      await afterUpdate(result.table, result.seats);
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
      await afterUpdate(result.table, result.seats);
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

      await afterUpdate(result.table, result.seats);
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

      await afterUpdate(result.table, result.seats);
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

      await afterUpdate(result.table, result.seats);
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
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
    cognitoClientId: process.env.COGNITO_CLIENT_ID,
    profileTableName: process.env.PROFILE_TABLE_NAME,
  };
}

let cachedStore: MatchStore | undefined;
let cachedEnv: RuntimeEnv | undefined;
let cachedResolvePlayer: ResolvePlayer | null = null;

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
    cachedResolvePlayer = playerResolverFromEnv(
      {
        userPoolId: cachedEnv.cognitoUserPoolId,
        clientId: cachedEnv.cognitoClientId,
        profileTableName: cachedEnv.profileTableName,
      },
      client,
    );
    if (!cachedResolvePlayer) {
      console.warn('Cognito is not configured; every player sits as a guest.');
    }
  }

  const runtimeHandler = createRuntimeHandler({
    store: cachedStore,
    postToConnection: createPostToConnection(event, cachedEnv.awsRegion),
    now: () => new Date().toISOString(),
    resolvePlayer: cachedResolvePlayer,
  });

  return runtimeHandler(event, context);
}
