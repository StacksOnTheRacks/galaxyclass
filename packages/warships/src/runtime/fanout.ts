import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { ServerMessage } from '../protocol.js';
import { buildSeatScopedSnapshot, viewerSeatOf } from './snapshot.js';
import type { WarshipsStore } from './store.js';
import type { PostToConnection, SeatRecord, TableRecord, WebSocketEvent } from './types.js';

export function createPostToConnection(event: WebSocketEvent, region?: string): PostToConnection {
  const { domainName, stage } = event.requestContext;
  const client = new ApiGatewayManagementApiClient({ region, endpoint: `https://${domainName}/${stage}` });
  return async (connectionId, message) => {
    await client.send(
      new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(JSON.stringify(message)) }),
    );
  };
}

export function isGoneError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'GoneException' || status === 410;
}

interface FanOutDeps {
  store: WarshipsStore;
  postToConnection: PostToConnection;
}

async function deliver(deps: FanOutDeps, connectionId: string, message: ServerMessage): Promise<void> {
  try {
    await deps.postToConnection(connectionId, message);
  } catch (error) {
    if (!isGoneError(error)) {
      throw error;
    }
    await deps.store.deleteConnection(connectionId);
  }
}

/**
 * Sends `message` to every connection seated in this game, in parallel, so both captains get a shot
 * within one round trip of each other. Unseated connections at the table never get it.
 */
export async function broadcastToPlayers(
  deps: FanOutDeps,
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  message: ServerMessage,
): Promise<void> {
  const connectionIds = await deps.store.listConnectionsForTable(table.tableId);
  const connections = await Promise.all(connectionIds.map((id) => deps.store.getConnection(id)));
  await Promise.all(
    connections.map((connection) => {
      const seat = connection ? viewerSeatOf(table, seats, connection) : undefined;
      return seat && table.game.players.includes(seat.seatId)
        ? deliver(deps, connection!.connectionId, message)
        : undefined;
    }),
  );
}

/** Sends each connection at the table its own seat-scoped snapshot; drops connections that have gone away. */
export async function fanOutSnapshots(
  deps: FanOutDeps,
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  now: number,
): Promise<void> {
  const connectionIds = await deps.store.listConnectionsForTable(table.tableId);
  for (const connectionId of connectionIds) {
    const connection = await deps.store.getConnection(connectionId);
    if (!connection || connection.tableId !== table.tableId) {
      continue;
    }
    await deliver(deps, connectionId, buildSeatScopedSnapshot(table, seats, connection, now));
  }
}
