import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { GameEvent, ServerMessage } from '../protocol.js';
import { buildSeatScopedSnapshot, redactEvent, viewerSeatOf } from './snapshot.js';
import type { WhodunitStore } from './store.js';
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
  store: WhodunitStore;
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
 * Sends each detective in the case the action's events, in order, redacted for them (a shown card
 * goes only to the suggester and the refuter). Detectives are served in parallel so everyone gets an
 * event within one round trip of each other. Connections without a seat in the case never get one.
 */
export async function broadcastEvents(
  deps: FanOutDeps,
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  events: ReadonlyArray<GameEvent>,
): Promise<void> {
  const { game } = table;
  const connectionIds = await deps.store.listConnectionsForTable(table.tableId);
  const connections = await Promise.all(connectionIds.map((id) => deps.store.getConnection(id)));
  await Promise.all(
    connections.map(async (connection) => {
      const seat = connection ? viewerSeatOf(table, seats, connection) : undefined;
      if (!seat || !game.players.includes(seat.seatId)) {
        return;
      }
      for (const event of events) {
        await deliver(deps, connection!.connectionId, {
          type: 'event',
          tableId: table.tableId,
          event: redactEvent(event, seat.seatId),
          currentSeatId: game.currentSeatId,
          nextActionAt: game.nextActionAt,
        });
      }
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
