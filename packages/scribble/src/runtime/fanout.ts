import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { buildSeatScopedSnapshot } from './snapshot.js';
import type { ScribbleStore } from './store.js';
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

/** Sends each connection at the table its own seat-scoped snapshot; drops connections that have gone away. */
export async function fanOutSnapshots(
  deps: { store: ScribbleStore; postToConnection: PostToConnection },
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
): Promise<void> {
  const connectionIds = await deps.store.listConnectionsForTable(table.tableId);
  for (const connectionId of connectionIds) {
    const connection = await deps.store.getConnection(connectionId);
    if (!connection || connection.tableId !== table.tableId) {
      continue;
    }
    try {
      await deps.postToConnection(connectionId, buildSeatScopedSnapshot(table, seats, connection));
    } catch (error) {
      if (isGoneError(error)) {
        await deps.store.deleteConnection(connectionId);
        continue;
      }
      throw error;
    }
  }
}
