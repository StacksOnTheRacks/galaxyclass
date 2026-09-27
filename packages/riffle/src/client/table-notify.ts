import { IDENTITY_SESSION_KEY, readStoredSession } from './identity/session.js';

export interface PublicTableNotifyHandle {
  disconnect(): void;
}

export function buildPublicTableWsUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/v1/ws`;
}

export function attachPublicTableNotify(options: {
  matchId: string;
  onRefresh: (cursor: number) => void | Promise<void>;
  wsFactory?: (url: string) => WebSocket;
  wsUrl?: string;
}): PublicTableNotifyHandle | undefined {
  const session = readStoredSession();
  if (!session?.bearer) {
    return undefined;
  }

  const wsUrl = options.wsUrl ?? buildPublicTableWsUrl(window.location);
  const socket = options.wsFactory ? options.wsFactory(wsUrl) : new WebSocket(wsUrl);

  let lastSeenCursor = 0;
  let closed = false;

  const disconnect = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  };

  socket.addEventListener('open', () => {
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        matchId: options.matchId,
        authorization: `Bearer ${session.bearer}`,
      }),
    );
  });

  socket.addEventListener('message', (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { type?: string }).type !== 'table.refresh' ||
      (parsed as { matchId?: string }).matchId !== options.matchId
    ) {
      return;
    }

    const cursor = (parsed as { cursor?: unknown }).cursor;
    if (typeof cursor !== 'number' || cursor <= lastSeenCursor) {
      return;
    }

    lastSeenCursor = cursor;
    void options.onRefresh(cursor);
  });

  return { disconnect };
}

export { IDENTITY_SESSION_KEY };
