export type SubscribeFrame = {
  type: 'subscribe';
  matchId: string;
  authorization?: string;
};

export type UnsubscribeFrame = {
  type: 'unsubscribe';
  matchId: string;
};

export type PingFrame = {
  type: 'ping';
};

export type ClientControlFrame = SubscribeFrame | UnsubscribeFrame | PingFrame;

export type SubscribedAckFrame = {
  type: 'subscribed';
  matchId: string;
  topic: string;
};

export type TableRefreshFrame = {
  type: 'table.refresh';
  matchId: string;
  cursor: number;
};

export type PongFrame = {
  type: 'pong';
};

export type ServerFrame = SubscribedAckFrame | TableRefreshFrame | PongFrame;

export const FORBIDDEN_MATCH_PREFIXES = ['seat:', 'hidden:', 'view:', 'write:'] as const;

export const SUBSCRIBE_TIMEOUT_MS = 2000;

export function publicTableTopic(matchId: string): string {
  return `table:${matchId}`;
}

export function isForbiddenMatchId(matchId: string): boolean {
  return FORBIDDEN_MATCH_PREFIXES.some((prefix) => matchId.startsWith(prefix));
}
