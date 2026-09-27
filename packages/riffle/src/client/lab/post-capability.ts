import { SEAT_CAPABILITY_MESSAGE_TYPE } from '../seat-capability.js';

export function postSeatCapabilityToIframe(
  iframe: HTMLIFrameElement,
  capability: string,
  targetOrigin: string = window.location.origin,
): void {
  if (!iframe.contentWindow) {
    return;
  }

  iframe.contentWindow.postMessage(
    { type: SEAT_CAPABILITY_MESSAGE_TYPE, capability },
    targetOrigin,
  );
}
