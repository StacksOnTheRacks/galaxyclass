import { identityAuthHeaders } from './identity/session.js';
import { renderDisplayNameEdit } from './surfaces/display-name-edit.js';
import {
  formatPublicSeatLabel,
  renderTableShell,
  type PublicTableSeat,
  type TableShellContext,
} from './surfaces/table-shell.js';

export type DisplayNameResponse = {
  matchId: string;
  seatId: string;
  seats: PublicTableSeat[];
};

export async function postDisplayName(
  matchId: string,
  displayName: string,
): Promise<Response> {
  return fetch(`/v1/play/matches/${encodeURIComponent(matchId)}/display-name`, {
    method: 'POST',
    headers: identityAuthHeaders(),
    credentials: 'same-origin',
    body: JSON.stringify({ displayName }),
  });
}

export function openDisplayNameEditor(
  root: HTMLElement,
  context: TableShellContext & { seatId: string; seats: PublicTableSeat[] },
): void {
  const seat = context.seats.find((entry) => entry.seatId === context.seatId);
  const initialValue = seat?.displayName ?? '';

  renderDisplayNameEdit(root, {
    matchId: context.matchId,
    initialValue,
    onDismiss: () => {
      renderTableShell(root, context);
    },
    onSave: async (displayName) => {
      const response = await postDisplayName(context.matchId, displayName);
      if (response.status === 400) {
        const body = (await response.json()) as { error?: string };
        if (body.error === 'invalid_display_name') {
          return { ok: false, validationError: true };
        }
        return { ok: false, validationError: true };
      }
      if (!response.ok) {
        return { ok: false };
      }

      const body = (await response.json()) as DisplayNameResponse;
      renderTableShell(root, {
        matchId: body.matchId,
        seatId: body.seatId,
        seats: body.seats,
        onEditDisplayName: () => {
          openDisplayNameEditor(root, {
            matchId: body.matchId,
            seatId: body.seatId,
            seats: body.seats,
          });
        },
      });
      return { ok: true };
    },
  });
}

export function seatPublicLabel(seat: PublicTableSeat, index: number): string {
  return formatPublicSeatLabel(seat, index);
}
