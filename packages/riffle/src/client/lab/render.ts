import type { LabState } from './states.js';
import { LAB_STATE_ANNOUNCEMENTS } from './states.js';

export interface LabRenderOptions {
  state: LabState;
  errorMessage?: string;
  dealEnabled?: boolean;
  controlsDisabled?: boolean;
  seat1Src?: string;
  seat2Src?: string;
}

function createControlButton(
  id: string,
  label: string,
  disabled: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = 'lab-control';
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

function createSeatColumn(
  seatLabel: string,
  iframeSrc: string | undefined,
): HTMLElement {
  const column = document.createElement('section');
  column.className = 'lab-seat-column';
  column.setAttribute('aria-labelledby', `${seatLabel.replace(/\s+/g, '-').toLowerCase()}-heading`);

  const heading = document.createElement('h2');
  heading.id = `${seatLabel.replace(/\s+/g, '-').toLowerCase()}-heading`;
  heading.className = 'lab-seat-label';
  heading.textContent = seatLabel;

  const slot = document.createElement('div');
  slot.className = 'lab-seat-slot';

  const iframe = document.createElement('iframe');
  iframe.className = 'lab-seat-iframe';
  iframe.title = seatLabel;
  iframe.setAttribute('aria-label', `${seatLabel} play surface`);
  if (iframeSrc) {
    iframe.src = iframeSrc;
  }

  slot.append(iframe);
  column.append(heading, slot);
  return column;
}

export function renderLabHarness(root: HTMLElement, options: LabRenderOptions): void {
  const {
    state,
    errorMessage,
    dealEnabled = false,
    controlsDisabled = false,
    seat1Src,
    seat2Src,
  } = options;

  root.className = 'lab-shell';
  root.dataset.state = state;
  root.replaceChildren();

  const header = document.createElement('header');
  header.className = 'lab-header';

  const title = document.createElement('h1');
  title.className = 'lab-title';
  title.textContent = 'Play lab';

  const subtitle = document.createElement('p');
  subtitle.className = 'lab-subtitle';
  subtitle.textContent = 'Operator harness for two embedded play seats';

  header.append(title, subtitle);

  const liveRegion = document.createElement('div');
  liveRegion.className = 'lab-live-region';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.textContent = LAB_STATE_ANNOUNCEMENTS[state];

  const controls = document.createElement('div');
  controls.className = 'lab-controls';
  controls.setAttribute('role', 'toolbar');
  controls.setAttribute('aria-label', 'Lab harness controls');

  const startDisabled =
    controlsDisabled || state === 'lab-starting' || state === 'lab-ready' || state === 'lab-two-seats';
  const dealDisabled = controlsDisabled || !dealEnabled;

  controls.append(
    createControlButton('lab-start-session', 'Start session', startDisabled),
    createControlButton('lab-deal', 'Deal', dealDisabled),
  );

  const seats = document.createElement('div');
  seats.className = 'lab-seats';
  seats.append(createSeatColumn('Seat 1', seat1Src), createSeatColumn('Seat 2', seat2Src));

  root.append(header, liveRegion, controls, seats);

  if (state === 'lab-starting') {
    const progress = document.createElement('p');
    progress.className = 'lab-progress';
    progress.textContent = 'Starting session…';
    root.append(progress);
  }

  if (state === 'lab-harness-error') {
    const alert = document.createElement('div');
    alert.className = 'lab-harness-error';
    alert.setAttribute('role', 'alert');
    alert.textContent =
      errorMessage ?? 'Could not start the lab session. Check server logs and try again.';
    root.append(alert);
  }
}

export function getLabShellDimensions(root: HTMLElement): { width: number; height: number } {
  const style = window.getComputedStyle(root);
  return {
    width: Number.parseFloat(style.width),
    height: Number.parseFloat(style.height),
  };
}

export function getLabSeatSlotDimensions(root: HTMLElement, seatIndex: 0 | 1): {
  width: number;
  height: number;
} {
  const slots = root.querySelectorAll('.lab-seat-slot');
  const slot = slots.item(seatIndex) as HTMLElement | null;
  if (!slot) {
    return { width: 0, height: 0 };
  }
  const style = window.getComputedStyle(slot);
  return {
    width: Number.parseFloat(style.width),
    height: Number.parseFloat(style.height),
  };
}
