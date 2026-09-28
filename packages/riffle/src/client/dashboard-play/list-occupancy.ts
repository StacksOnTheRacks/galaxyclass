import type { OutboundMessage, TableListMessage } from '../../runtime/types.js';

export type OccupancyById = Record<string, number>;

export interface OccupancySocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface ListOccupancyDeps {
  webSocketUrl: string;
  tableIds: string[];
  createSocket: (url: string) => OccupancySocket;
  onUpdate: (occupancy: OccupancyById) => void;
  keepAliveMs?: number;
  refreshMs?: number;
  reconnectDelayMs?: number;
}

const DEFAULT_REFRESH_MS = 5000;

function parseServerMessage(data: unknown): OutboundMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      return parsed as OutboundMessage;
    }
  } catch {
    return null;
  }
  return null;
}

function occupancyFromList(message: TableListMessage): OccupancyById {
  const occupancy: OccupancyById = {};
  for (const row of message.tables) {
    if (
      typeof row.tableId === 'string' &&
      typeof row.seatedCount === 'number' &&
      Number.isInteger(row.seatedCount) &&
      row.seatedCount >= 0
    ) {
      occupancy[row.tableId] = row.seatedCount;
    }
  }
  return occupancy;
}

/** Opens a read-only socket and asks the runtime how many seats are taken on known tables. */
export function startListOccupancy(deps: ListOccupancyDeps): { dispose: () => void } {
  if (deps.tableIds.length === 0) {
    return { dispose: () => undefined };
  }

  const keepAliveMs = deps.keepAliveMs ?? 5 * 60 * 1000;
  const refreshMs = deps.refreshMs ?? DEFAULT_REFRESH_MS;
  const reconnectDelayMs = deps.reconnectDelayMs ?? 1000;

  let disposed = false;
  let socket: OccupancySocket | null = null;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let refresh: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = (): void => {
    if (keepAlive !== undefined) {
      clearInterval(keepAlive);
    }
    if (refresh !== undefined) {
      clearInterval(refresh);
    }
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
    }
    keepAlive = undefined;
    refresh = undefined;
    reconnectTimer = undefined;
  };

  const request = (active: OccupancySocket): void => {
    active.send(JSON.stringify({ action: 'list_tables', tableIds: deps.tableIds }));
  };

  const scheduleReconnect = (): void => {
    if (disposed || reconnectTimer !== undefined) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, reconnectDelayMs);
  };

  const connect = (): void => {
    if (disposed) {
      return;
    }

    let active: OccupancySocket;
    try {
      active = deps.createSocket(deps.webSocketUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    socket = active;
    let ended = false;

    const onEnded = (): void => {
      if (ended) {
        return;
      }
      ended = true;
      clearTimers();
      if (!disposed) {
        scheduleReconnect();
      }
    };

    active.addEventListener('open', () => {
      request(active);
      keepAlive = setInterval(() => {
        if (!ended) {
          active.send(JSON.stringify({ action: 'ping' }));
        }
      }, keepAliveMs);
      if (refreshMs > 0) {
        refresh = setInterval(() => {
          if (!ended) {
            request(active);
          }
        }, refreshMs);
      }
    });
    active.addEventListener('error', onEnded);
    active.addEventListener('close', onEnded);
    active.addEventListener('message', (event) => {
      if (disposed) {
        return;
      }
      const message = parseServerMessage(event.data);
      if (!message || message.type !== 'table_list') {
        return;
      }
      deps.onUpdate(occupancyFromList(message));
    });
  };

  connect();

  return {
    dispose: () => {
      disposed = true;
      clearTimers();
      socket?.close();
    },
  };
}
