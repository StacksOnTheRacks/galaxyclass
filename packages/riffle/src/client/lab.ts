import './lab-styles.css';
import { postSeatCapabilityToIframe } from './lab/post-capability.js';
import {
  isTableChangedMessage,
  postTableRefreshToIframe,
} from './table-refresh.js';
import { renderLabHarness } from './lab/render.js';
import type { LabSessionAttach, LabState } from './lab/states.js';
import { LAB_STATE_ANNOUNCEMENTS } from './lab/states.js';

const LAB_SESSION_PATH = '/v1/lab/session';
const LAB_DEAL_PATH = '/v1/lab/deal';

let currentState: LabState = 'lab-idle';
let sessionAttach: LabSessionAttach | undefined;
const deliveredCapabilities = new Set<string>();
let pendingLoads = 0;
let tableChangedListenerBound = false;

function getRoot(): HTMLElement {
  const root = document.getElementById('lab-app');
  if (!root) {
    throw new Error('Lab harness root element is missing');
  }
  return root;
}

function getSeatIframes(root: HTMLElement): [HTMLIFrameElement, HTMLIFrameElement] {
  const iframes = root.querySelectorAll('.lab-seat-iframe');
  return [iframes.item(0) as HTMLIFrameElement, iframes.item(1) as HTMLIFrameElement];
}

function clearSessionMemory(): void {
  sessionAttach = undefined;
  deliveredCapabilities.clear();
  pendingLoads = 0;
}

function setState(
  state: LabState,
  options: {
    errorMessage?: string;
    seat1Src?: string;
    seat2Src?: string;
  } = {},
): void {
  currentState = state;
  const dealEnabled = state === 'lab-two-seats';
  const controlsDisabled = state === 'lab-starting' || state === 'lab-ready';

  renderLabHarness(getRoot(), {
    state,
    errorMessage: options.errorMessage,
    dealEnabled,
    controlsDisabled,
    seat1Src: options.seat1Src,
    seat2Src: options.seat2Src,
  });
}

function handleControlClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === 'lab-start-session') {
    void startSession();
  } else if (target.id === 'lab-deal') {
    void dealHand();
  }
}

function promoteToTwoSeats(root: HTMLElement): void {
  currentState = 'lab-two-seats';
  root.dataset.state = 'lab-two-seats';

  const liveRegion = root.querySelector('.lab-live-region');
  if (liveRegion) {
    liveRegion.textContent = LAB_STATE_ANNOUNCEMENTS['lab-two-seats'];
  }

  const dealButton = root.querySelector('#lab-deal') as HTMLButtonElement | null;
  if (dealButton) {
    dealButton.disabled = false;
  }

  const startButton = root.querySelector('#lab-start-session') as HTMLButtonElement | null;
  if (startButton) {
    startButton.disabled = true;
  }
}

function refreshBothSeatIframes(root: HTMLElement): void {
  const [iframe1, iframe2] = getSeatIframes(root);
  postTableRefreshToIframe(iframe1);
  postTableRefreshToIframe(iframe2);
}

function acceptTableChangedFromSeats(): void {
  if (tableChangedListenerBound) {
    return;
  }
  tableChangedListenerBound = true;
  window.addEventListener('message', (event) => {
    if (!event.origin || event.origin !== window.location.origin) {
      return;
    }
    if (!isTableChangedMessage(event.data)) {
      return;
    }
    if (currentState !== 'lab-two-seats') {
      return;
    }
    refreshBothSeatIframes(getRoot());
  });
}

function attachIframeLoadHandlers(root: HTMLElement, attach: LabSessionAttach): void {
  const [iframe1, iframe2] = getSeatIframes(root);
  const seats = attach.seats;
  pendingLoads = 2;

  const onLoad = (iframe: HTMLIFrameElement, seatIndex: 0 | 1) => {
    const seat = seats[seatIndex];
    if (!seat || deliveredCapabilities.has(seat.seatId)) {
      return;
    }

    postSeatCapabilityToIframe(iframe, seat.capabilityToken);
    deliveredCapabilities.add(seat.seatId);
    seat.capabilityToken = '';

    pendingLoads -= 1;
    if (pendingLoads <= 0) {
      promoteToTwoSeats(root);
    }
  };

  iframe1.addEventListener('load', () => onLoad(iframe1, 0));
  iframe2.addEventListener('load', () => onLoad(iframe2, 1));
}

export async function startSession(): Promise<void> {
  if (currentState === 'lab-starting' || currentState === 'lab-ready') {
    return;
  }

  clearSessionMemory();
  setState('lab-starting');

  try {
    const response = await fetch(LAB_SESSION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });

    if (!response.ok) {
      setState('lab-harness-error', {
        errorMessage: 'Lab session could not be started.',
      });
      return;
    }

    const body = (await response.json()) as LabSessionAttach;
    if (!body.matchId || !Array.isArray(body.seats) || body.seats.length !== 2) {
      setState('lab-harness-error', {
        errorMessage: 'Lab session response was invalid.',
      });
      return;
    }

    sessionAttach = body;
    const seat1Src = body.seats[0]?.playUrl;
    const seat2Src = body.seats[1]?.playUrl;

    setState('lab-ready', { seat1Src, seat2Src });
    attachIframeLoadHandlers(getRoot(), body);
  } catch {
    setState('lab-harness-error', {
      errorMessage: 'Lab session request failed.',
    });
  }
}

export async function dealHand(): Promise<void> {
  if (currentState !== 'lab-two-seats' || !sessionAttach?.matchId) {
    return;
  }

  const dealButton = getRoot().querySelector('#lab-deal') as HTMLButtonElement | null;
  if (dealButton) {
    dealButton.disabled = true;
  }

  try {
    const response = await fetch(LAB_DEAL_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ matchId: sessionAttach.matchId }),
    });

    if (!response.ok) {
      setState('lab-harness-error', {
        errorMessage: 'Deal request failed.',
        seat1Src: sessionAttach.seats[0]?.playUrl,
        seat2Src: sessionAttach.seats[1]?.playUrl,
      });
      return;
    }

    refreshBothSeatIframes(getRoot());

    if (dealButton) {
      dealButton.disabled = false;
    }
  } catch {
    setState('lab-harness-error', {
      errorMessage: 'Deal request failed.',
      seat1Src: sessionAttach.seats[0]?.playUrl,
      seat2Src: sessionAttach.seats[1]?.playUrl,
    });
  }
}

export function bootstrapLabHarness(): void {
  const root = getRoot();
  root.addEventListener('click', handleControlClick);
  acceptTableChangedFromSeats();
  clearSessionMemory();
  setState('lab-idle');
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('lab-app');
  if (root) {
    bootstrapLabHarness();
  }
}

export { currentState, sessionAttach };
