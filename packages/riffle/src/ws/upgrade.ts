import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { RiffleEnv } from '../server/env.js';
import { validateMatchId } from '../server/seats/validate.js';
import { parseIdentityBearer } from '../server/identity/bearer.js';
import {
  parseAuthorizationField,
  tokenAppearsInWebSocketProtocol,
  type VerifyPlayBearer,
} from './auth.js';
import type { WsHub } from './hub.js';
import {
  isForbiddenMatchId,
  publicTableTopic,
  SUBSCRIBE_TIMEOUT_MS,
  type ClientControlFrame,
} from './types.js';

export interface WsUpgradeDeps {
  hub: WsHub;
  verifyPlayBearer: VerifyPlayBearer;
  env: RiffleEnv;
}

const ALLOWED_SUBSCRIBE_KEYS = new Set(['type', 'matchId', 'authorization']);
const ALLOWED_UNSUBSCRIBE_KEYS = new Set(['type', 'matchId']);
const ALLOWED_PING_KEYS = new Set(['type']);

function closeSocket(socket: WebSocket, reason: string): void {
  socket.close(1008, reason);
}

function rejectUpgrade(socket: Duplex): void {
  socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
  socket.destroy();
}

function isWsPath(pathname: string): boolean {
  return pathname === '/v1/ws' || pathname === '/v1/ws/';
}

function upgradeUrlHasQueryOrHash(request: IncomingMessage): boolean {
  const rawUrl = request.url ?? '';
  return rawUrl.includes('?') || rawUrl.includes('#');
}

function parseClientFrame(raw: string): ClientControlFrame | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (obj.type === 'ping') {
    if (!keys.every((key) => ALLOWED_PING_KEYS.has(key))) {
      return undefined;
    }
    return { type: 'ping' };
  }

  if (obj.type === 'unsubscribe') {
    if (!keys.every((key) => ALLOWED_UNSUBSCRIBE_KEYS.has(key))) {
      return undefined;
    }
    if (typeof obj.matchId !== 'string') {
      return undefined;
    }
    return { type: 'unsubscribe', matchId: obj.matchId };
  }

  if (obj.type === 'subscribe') {
    const allowedKeys = obj.authorization === undefined
      ? new Set(['type', 'matchId'])
      : ALLOWED_SUBSCRIBE_KEYS;
    if (!keys.every((key) => allowedKeys.has(key))) {
      return undefined;
    }
    if (typeof obj.matchId !== 'string') {
      return undefined;
    }
    if (obj.authorization !== undefined && typeof obj.authorization !== 'string') {
      return undefined;
    }
    return {
      type: 'subscribe',
      matchId: obj.matchId,
      authorization: obj.authorization,
    };
  }

  return undefined;
}

function resolveSubscribeToken(
  frame: Extract<ClientControlFrame, { type: 'subscribe' }>,
  upgradeToken: string | undefined,
  verifyPlayBearer: VerifyPlayBearer,
): VerifiedSubscribe | undefined {
  const frameToken = frame.authorization
    ? parseAuthorizationField(frame.authorization)
    : undefined;

  if (upgradeToken && frameToken && upgradeToken !== frameToken) {
    return undefined;
  }

  const token = frameToken ?? upgradeToken;
  if (!token) {
    return undefined;
  }

  const verified = verifyPlayBearer(token);
  if (!verified) {
    return undefined;
  }

  return { matchId: frame.matchId, playerSubject: verified.playerSubject };
}

type VerifiedSubscribe = {
  matchId: string;
  playerSubject: string;
};

function handleSubscribe(
  socket: WebSocket,
  frame: Extract<ClientControlFrame, { type: 'subscribe' }>,
  upgradeToken: string | undefined,
  deps: WsUpgradeDeps,
  state: ConnectionState,
): void {
  const matchId = validateMatchId(frame.matchId);
  if (!matchId || isForbiddenMatchId(matchId)) {
    closeSocket(socket, 'forbidden_topic');
    return;
  }

  const verified = resolveSubscribeToken(frame, upgradeToken, deps.verifyPlayBearer);
  if (!verified || verified.matchId !== matchId) {
    closeSocket(socket, 'unauthorized');
    return;
  }

  deps.hub.clearSocket(socket);
  deps.hub.addSubscriber(matchId, socket);
  state.subscribed = true;
  state.matchId = matchId;

  socket.send(
    JSON.stringify({
      type: 'subscribed',
      matchId,
      topic: publicTableTopic(matchId),
    }),
  );
}

type ConnectionState = {
  subscribed: boolean;
  matchId?: string;
  subscribeTimer?: ReturnType<typeof setTimeout>;
};

function handleConnection(
  socket: WebSocket,
  upgradeToken: string | undefined,
  deps: WsUpgradeDeps,
): void {
  const state: ConnectionState = { subscribed: false };

  state.subscribeTimer = setTimeout(() => {
    if (!state.subscribed) {
      closeSocket(socket, 'subscribe_timeout');
    }
  }, SUBSCRIBE_TIMEOUT_MS);

  socket.on('message', (data) => {
    const raw = typeof data === 'string' ? data : data.toString('utf8');
    const frame = parseClientFrame(raw);
    if (!frame) {
      closeSocket(socket, 'invalid_subscribe');
      return;
    }

    if (frame.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (frame.type === 'unsubscribe') {
      const matchId = validateMatchId(frame.matchId);
      if (!matchId || state.matchId !== matchId) {
        closeSocket(socket, 'invalid_subscribe');
        return;
      }
      deps.hub.removeSubscriber(matchId, socket);
      state.subscribed = false;
      state.matchId = undefined;
      return;
    }

    if (frame.type === 'subscribe') {
      if (state.subscribed) {
        handleSubscribe(socket, frame, upgradeToken, deps, state);
        return;
      }
      handleSubscribe(socket, frame, upgradeToken, deps, state);
      if (state.subscribed && state.subscribeTimer) {
        clearTimeout(state.subscribeTimer);
        state.subscribeTimer = undefined;
      }
    }
  });

  socket.on('close', () => {
    if (state.subscribeTimer) {
      clearTimeout(state.subscribeTimer);
    }
    deps.hub.clearSocket(socket);
  });
}

export function attachWsUpgrade(server: HttpServer, deps: WsUpgradeDeps): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (!isWsPath(url.pathname)) {
      socket.destroy();
      return;
    }

    if (upgradeUrlHasQueryOrHash(request)) {
      rejectUpgrade(socket);
      return;
    }

    if (tokenAppearsInWebSocketProtocol(request.headers['sec-websocket-protocol'])) {
      rejectUpgrade(socket);
      return;
    }

    if (request.headers['x-riffle-seat-capability']) {
      rejectUpgrade(socket);
      return;
    }

    const upgradeToken = parseIdentityBearer(request.headers.authorization, deps.env);

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
      handleConnection(ws, upgradeToken, deps);
    });
  });
}
