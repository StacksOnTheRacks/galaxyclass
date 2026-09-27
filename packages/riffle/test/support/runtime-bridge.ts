import { createRuntimeHandler } from '../../src/runtime/handler.js';
import type { WebSocketEvent } from '../../src/runtime/types.js';
import { FakePlaySocket } from './fake-play-socket.js';
import { MemoryMatchStore } from './memory-store.js';

function wsEvent(routeKey: string, connectionId: string, body?: string): WebSocketEvent {
  return {
    requestContext: {
      routeKey,
      connectionId,
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      stage: 'prod',
    },
    body,
  };
}

class BridgedSocket extends FakePlaySocket {
  constructor(
    url: string,
    private readonly bridge: RuntimeBridge,
    readonly connectionId: string,
  ) {
    super(url);
  }

  override send(data: string): void {
    super.send(data);
    this.bridge.dispatch(this.connectionId, data);
  }
}

export class RuntimeBridge {
  readonly store = new MemoryMatchStore();
  private sockets = new Map<string, BridgedSocket>();
  private queue: Promise<unknown> = Promise.resolve();
  private counter = 0;
  nowMs = Date.parse('2026-09-25T12:00:00.000Z');
  readonly handler;

  constructor(rngSeed = 42) {
    this.handler = createRuntimeHandler({
      store: this.store,
      postToConnection: async (connectionId, message) => {
        this.sockets.get(connectionId)?.receive(message);
      },
      now: () => new Date(this.nowMs).toISOString(),
      rngSeed: () => rngSeed,
    });
  }

  createSocket = (url: string): BridgedSocket => {
    this.counter += 1;
    const connectionId = `conn-${this.counter}`;
    const socket = new BridgedSocket(url, this, connectionId);
    this.sockets.set(connectionId, socket);
    this.queue = this.queue.then(async () => {
      await this.handler(wsEvent('$connect', connectionId), {});
      socket.emit('open');
    });
    return socket;
  };

  dispatch(connectionId: string, data: string): void {
    if (!this.sockets.has(connectionId)) {
      return;
    }
    this.queue = this.queue.then(() => this.handler(wsEvent('$default', connectionId, data), {}));
  }

  /** Simulates the network dropping a socket: the runtime sees $disconnect, the client sees close. */
  drop(socket: FakePlaySocket): void {
    const entry = [...this.sockets.entries()].find(([, row]) => row === socket);
    if (!entry) {
      return;
    }
    const [connectionId, bridged] = entry;
    this.sockets.delete(connectionId);
    this.queue = this.queue.then(async () => {
      await this.handler(wsEvent('$disconnect', connectionId), {});
      bridged.emit('close');
    });
  }

  latestSocket(): BridgedSocket | undefined {
    return [...this.sockets.values()].at(-1);
  }

  async settle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.queue;
      await current;
      await Promise.resolve();
    } while (current !== this.queue);
  }
}
