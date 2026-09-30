import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../../runtime/types.js';

export const SEAT_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const SIT_SUBMITTING_MESSAGE = 'Taking your seat…';
export const TABLE_FULL_MESSAGE = "The table is full. You'll be seated when a spot opens.";

export interface AutoSitState {
  /** False after the player leaves on purpose; they rejoin with Take a seat. */
  wantsSeat: boolean;
  submitting: boolean;
  seatId: string | null;
  /** Seats the server just refused; cleared on the next snapshot. */
  rejected: Set<string>;
  notice: string | null;
}

export function createAutoSitState(): AutoSitState {
  return {
    wantsSeat: true,
    submitting: false,
    seatId: null,
    rejected: new Set(),
    notice: null,
  };
}

function isTakeable(seat: PlayerSnapshotSeat, snapshot: TableSnapshotMessage): boolean {
  if (!seat.away) {
    return false;
  }
  const betweenHands = snapshot.status !== 'hand_in_progress' || snapshot.phase === 'complete';
  return betweenHands || !seat.inHand;
}

/** Lowest empty seat, else the lowest away seat that is out of the live hand. */
export function firstOpenSeat(
  snapshot: TableSnapshotMessage,
  rejected: ReadonlySet<string> = new Set(),
): string | null {
  const bySeat = new Map(snapshot.seats.map((seat) => [seat.seatId, seat]));
  const candidates = SEAT_IDS.filter((seatId) => !rejected.has(seatId));
  return (
    candidates.find((seatId) => !bySeat.has(seatId)) ??
    candidates.find((seatId) => {
      const seat = bySeat.get(seatId);
      return seat !== undefined && isTakeable(seat, snapshot);
    }) ??
    null
  );
}

export interface SitPanelCallbacks {
  onTakeSeat: () => void;
}

export function renderSitPanel(
  region: HTMLElement,
  state: AutoSitState,
  callbacks: SitPanelCallbacks,
): void {
  region.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'sit-panel';
  panel.dataset.field = 'sit-panel';

  if (!state.wantsSeat) {
    const take = document.createElement('button');
    take.type = 'button';
    take.className = 'sit-panel-submit';
    take.dataset.field = 'take-seat';
    take.textContent = 'Take a seat';
    take.addEventListener('click', () => callbacks.onTakeSeat());
    panel.append(take);
  }

  const status = document.createElement('p');
  status.className = 'sit-panel-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  if (state.submitting) {
    status.setAttribute('aria-busy', 'true');
    status.textContent = SIT_SUBMITTING_MESSAGE;
  } else {
    status.textContent = state.notice ?? (state.wantsSeat ? SIT_SUBMITTING_MESSAGE : "You're watching this table.");
  }
  panel.append(status);

  region.append(panel);
}
