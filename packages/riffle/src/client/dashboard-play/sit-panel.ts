import type { PlayerSnapshotSeat } from '../../runtime/types.js';
import { DISPLAY_NAME_ERROR_MESSAGE, validateDisplayName } from '../../shared/display-name.js';

export const SEAT_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const SIT_SUBMITTING_MESSAGE = 'Taking your seat…';

export interface SitDraft {
  seatId: string | null;
  displayName: string;
  submitting: boolean;
  nameError: boolean;
  notice: string | null;
}

export function createSitDraft(): SitDraft {
  return { seatId: null, displayName: '', submitting: false, nameError: false, notice: null };
}

export interface SitPanelCallbacks {
  onSit: (seatId: string, displayName: string) => void;
  onChange: () => void;
}

export function renderSitPanel(
  region: HTMLElement,
  seats: PlayerSnapshotSeat[],
  draft: SitDraft,
  callbacks: SitPanelCallbacks,
): void {
  const hadNameFocus = document.activeElement?.id === 'sit-display-name';
  region.replaceChildren();

  // Away seats can be taken over between hands, so they count as open.
  const occupied = new Map(seats.filter((seat) => !seat.away).map((seat) => [seat.seatId, seat]));
  const empty = new Set(SEAT_IDS.filter((seatId) => !seats.some((seat) => seat.seatId === seatId)));
  if (draft.seatId && occupied.has(draft.seatId)) {
    draft.seatId = null;
  }
  if (!draft.seatId) {
    draft.seatId =
      SEAT_IDS.find((seatId) => empty.has(seatId)) ??
      SEAT_IDS.find((seatId) => !occupied.has(seatId)) ??
      null;
  }

  const form = document.createElement('form');
  form.className = 'sit-panel';
  form.dataset.field = 'sit-panel';
  form.noValidate = true;
  form.setAttribute('aria-labelledby', 'sit-panel-title');

  const title = document.createElement('h2');
  title.id = 'sit-panel-title';
  title.className = 'sit-panel-title';
  title.textContent = 'Pick a seat';

  const seatGroup = document.createElement('fieldset');
  seatGroup.className = 'sit-panel-seats';
  seatGroup.disabled = draft.submitting;
  const legend = document.createElement('legend');
  legend.textContent = 'Seat';
  seatGroup.append(legend);

  for (const seatId of SEAT_IDS) {
    const taken = occupied.get(seatId);
    const option = document.createElement('label');
    option.className = 'sit-panel-seat';
    option.dataset.seatId = seatId;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'seatId';
    radio.value = seatId;
    radio.disabled = Boolean(taken);
    radio.checked = draft.seatId === seatId;
    radio.addEventListener('change', () => {
      draft.seatId = seatId;
      callbacks.onChange();
    });

    const text = document.createElement('span');
    text.textContent = taken ? `Seat ${seatId} · ${taken.displayName}` : `Seat ${seatId} · open`;

    option.append(radio, text);
    seatGroup.append(option);
  }

  const nameLabel = document.createElement('label');
  nameLabel.className = 'sit-panel-name-label';
  nameLabel.setAttribute('for', 'sit-display-name');
  nameLabel.textContent = 'Display name';

  const nameInput = document.createElement('input');
  nameInput.id = 'sit-display-name';
  nameInput.className = 'sit-panel-name-input';
  nameInput.type = 'text';
  nameInput.name = 'displayName';
  nameInput.autocomplete = 'off';
  nameInput.maxLength = 64;
  nameInput.value = draft.displayName;
  nameInput.disabled = draft.submitting;
  nameInput.addEventListener('input', () => {
    draft.displayName = nameInput.value;
  });

  const nameError = document.createElement('p');
  nameError.id = 'sit-display-name-error';
  nameError.className = 'sit-panel-error';
  nameError.setAttribute('role', 'alert');
  nameError.hidden = !draft.nameError;
  nameError.textContent = draft.nameError ? DISPLAY_NAME_ERROR_MESSAGE : '';
  if (draft.nameError) {
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.setAttribute('aria-describedby', nameError.id);
  }

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'sit-panel-submit';
  submit.textContent = 'Sit at Table';
  submit.disabled = draft.submitting || !draft.seatId;

  const status = document.createElement('p');
  status.className = 'sit-panel-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  if (draft.submitting) {
    status.setAttribute('aria-busy', 'true');
    status.textContent = SIT_SUBMITTING_MESSAGE;
  } else {
    status.textContent = draft.notice ?? '';
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (draft.submitting || !draft.seatId) {
      return;
    }
    draft.displayName = nameInput.value;
    const validated = validateDisplayName(draft.displayName);
    if (!validated.ok) {
      draft.nameError = true;
      draft.notice = null;
      callbacks.onChange();
      document.getElementById('sit-display-name')?.focus();
      return;
    }
    draft.nameError = false;
    draft.notice = null;
    draft.submitting = true;
    callbacks.onSit(draft.seatId, validated.value);
  });

  form.append(title, seatGroup, nameLabel, nameInput, nameError, submit, status);
  region.append(form);

  if (hadNameFocus && !nameInput.disabled) {
    nameInput.focus();
  }
}
