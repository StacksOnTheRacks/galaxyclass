import type { WebSocket } from 'ws';
import type { TableRefreshFrame } from './types.js';

export interface WsHub {
  notifyPublicTable(matchId: string): number;
  addSubscriber(matchId: string, socket: WebSocket): void;
  removeSubscriber(matchId: string, socket: WebSocket): void;
  clearSocket(socket: WebSocket): void;
}

export function createWsHub(): WsHub {
  const subscribersByMatch = new Map<string, Set<WebSocket>>();
  const cursorsByMatch = new Map<string, number>();
  const topicsBySocket = new WeakMap<WebSocket, string>();

  function addSubscriber(matchId: string, socket: WebSocket): void {
    let subscribers = subscribersByMatch.get(matchId);
    if (!subscribers) {
      subscribers = new Set();
      subscribersByMatch.set(matchId, subscribers);
    }
    subscribers.add(socket);
    topicsBySocket.set(socket, matchId);
  }

  function removeSubscriber(matchId: string, socket: WebSocket): void {
    const subscribers = subscribersByMatch.get(matchId);
    if (!subscribers) {
      return;
    }
    subscribers.delete(socket);
    if (subscribers.size === 0) {
      subscribersByMatch.delete(matchId);
    }
    if (topicsBySocket.get(socket) === matchId) {
      topicsBySocket.delete(socket);
    }
  }

  function clearSocket(socket: WebSocket): void {
    const matchId = topicsBySocket.get(socket);
    if (matchId) {
      removeSubscriber(matchId, socket);
    }
  }

  function notifyPublicTable(matchId: string): number {
    const cursor = (cursorsByMatch.get(matchId) ?? 0) + 1;
    cursorsByMatch.set(matchId, cursor);

    const frame: TableRefreshFrame = {
      type: 'table.refresh',
      matchId,
      cursor,
    };
    const payload = JSON.stringify(frame);
    const subscribers = subscribersByMatch.get(matchId);
    if (subscribers) {
      for (const socket of subscribers) {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
        }
      }
    }

    return cursor;
  }

  return {
    notifyPublicTable,
    addSubscriber,
    removeSubscriber,
    clearSocket,
  };
}
