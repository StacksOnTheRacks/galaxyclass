export const SEAT_CAPABILITY_MESSAGE_TYPE = 'riffle.seatCapability';
export const SEAT_CAPABILITY_HEADER = 'X-Riffle-Seat-Capability';

const BOOTSTRAP_KEYS = ['token', 'bootstrapToken', 'bt'] as const;

let storedSeatCapability = '';

function isBootstrapShaped(data: object): boolean {
  return BOOTSTRAP_KEYS.some((key) => key in data);
}

function isValidCapabilityPayload(data: unknown): data is {
  type: typeof SEAT_CAPABILITY_MESSAGE_TYPE;
  capability: string;
} {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (isBootstrapShaped(data)) {
    return false;
  }
  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes('type') || !keys.includes('capability')) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    record.type === SEAT_CAPABILITY_MESSAGE_TYPE &&
    typeof record.capability === 'string' &&
    record.capability.length > 0
  );
}

export function clearStoredSeatCapability(): void {
  storedSeatCapability = '';
}

export function acceptSeatCapabilityPostMessage(): void {
  window.addEventListener('message', (event) => {
    if (!event.origin || event.origin !== window.location.origin) {
      return;
    }
    if (!isValidCapabilityPayload(event.data)) {
      return;
    }
    storedSeatCapability = event.data.capability;
  });
}

export async function seatScopedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!storedSeatCapability) {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers);
  headers.set(SEAT_CAPABILITY_HEADER, storedSeatCapability);
  return fetch(input, { ...init, headers });
}
