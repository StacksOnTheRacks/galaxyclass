import type { PlaySocket } from '../../src/client/dashboard-play/session.js';

type Listener = (event?: { data: unknown }) => void;

export class FakePlaySocket implements PlaySocket {
  readonly sent: Array<Record<string, unknown>> = [];
  closed = false;
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {}

  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    const rows = this.listeners.get(type) ?? [];
    rows.push(listener as Listener);
    this.listeners.set(type, rows);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: 'open' | 'close' | 'error'): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  receive(message: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(message) });
    }
  }

  actions(): string[] {
    return this.sent.map((message) => String(message.action));
  }
}

export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

export function configFetch(
  body: unknown = { webSocketUrl: 'wss://example.execute-api.us-east-1.amazonaws.com/prod' },
  init: { ok?: boolean; reject?: boolean } = {},
) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    if (init.reject) {
      throw new TypeError('network down');
    }
    return {
      ok: init.ok ?? true,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function setViewport(width: number, height = 900): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  window.dispatchEvent(new Event('resize'));
}

export function mountRoot(): HTMLElement {
  const root = document.createElement('main');
  root.id = 'app';
  document.body.replaceChildren(root);
  return root;
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}
