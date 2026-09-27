import { publicBase } from '../dashboard/public-base.js';

export interface PlayConfig {
  webSocketUrl: string;
}

export async function loadPlayConfig(fetchImpl: typeof fetch): Promise<PlayConfig | null> {
  try {
    const response = await fetchImpl(`${publicBase()}/config.json`, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const { webSocketUrl } = body as Record<string, unknown>;
    if (typeof webSocketUrl !== 'string' || !/^wss?:\/\//.test(webSocketUrl)) {
      return null;
    }
    return { webSocketUrl };
  } catch {
    return null;
  }
}
