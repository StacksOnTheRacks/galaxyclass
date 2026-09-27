export const TABLE_REFRESH_MESSAGE_TYPE = 'riffle.tableRefresh';
export const TABLE_CHANGED_MESSAGE_TYPE = 'riffle.tableChanged';

function isTypedMessage(data: unknown, type: string): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const keys = Object.keys(data);
  return keys.length === 1 && (data as { type?: unknown }).type === type;
}

export function isTableRefreshMessage(data: unknown): boolean {
  return isTypedMessage(data, TABLE_REFRESH_MESSAGE_TYPE);
}

export function isTableChangedMessage(data: unknown): boolean {
  return isTypedMessage(data, TABLE_CHANGED_MESSAGE_TYPE);
}

export function postTableRefreshToIframe(
  iframe: HTMLIFrameElement,
  targetOrigin: string = window.location.origin,
): void {
  if (!iframe.contentWindow) {
    return;
  }
  iframe.contentWindow.postMessage({ type: TABLE_REFRESH_MESSAGE_TYPE }, targetOrigin);
}

export function postTableChangedToParent(
  targetOrigin: string = window.location.origin,
): void {
  if (window.parent === window) {
    return;
  }
  window.parent.postMessage({ type: TABLE_CHANGED_MESSAGE_TYPE }, targetOrigin);
}
