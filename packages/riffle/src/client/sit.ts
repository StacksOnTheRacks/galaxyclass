import {
  identityAuthHeaders,
  readStoredSession,
  writeStoredSession,
  type StoredIdentitySession,
} from './identity/session.js';
import { openDisplayNameEditor } from './display-name.js';
import { renderSitSubmitting } from './surfaces/sit-submitting.js';
import { renderTableShell } from './surfaces/table-shell.js';
import { renderUnseated, type PublicTableSeat } from './surfaces/unseated.js';

export type SitResponse = {
  matchId: string;
  seatId: string;
  seats: PublicTableSeat[];
};

export async function fetchPublicTable(
  matchId: string,
): Promise<{ seats: PublicTableSeat[] } | null> {
  const response = await fetch(`/v1/play/matches/${encodeURIComponent(matchId)}/table`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { seats?: PublicTableSeat[] };
  return { seats: body.seats ?? [] };
}

export async function ensureBearer(): Promise<StoredIdentitySession> {
  const existing = readStoredSession();
  if (existing) {
    return existing;
  }

  const response = await fetch('/v1/identity/anonymous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: '{}',
  });
  if (!response.ok) {
    throw new Error('anonymous_issue_failed');
  }

  const issued = (await response.json()) as {
    bearer: string;
    playerSubject: string;
  };
  const session: StoredIdentitySession = {
    bearer: issued.bearer,
    playerSubject: issued.playerSubject,
    kind: 'anonymous',
  };
  writeStoredSession(session);
  return session;
}

export async function postSit(matchId: string): Promise<Response> {
  await ensureBearer();
  return fetch(`/v1/play/matches/${encodeURIComponent(matchId)}/sit`, {
    method: 'POST',
    headers: identityAuthHeaders(),
    credentials: 'same-origin',
    body: '{}',
  });
}

export async function handleSitAtTable(root: HTMLElement, matchId: string): Promise<void> {
  renderSitSubmitting(root, { matchId });

  try {
    const response = await postSit(matchId);
    if (response.ok) {
      const body = (await response.json()) as SitResponse;
      const shellContext = {
        matchId: body.matchId,
        seatId: body.seatId,
        seats: body.seats,
        onEditDisplayName: () => {
          openDisplayNameEditor(root, {
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
        },
      };
      renderTableShell(root, shellContext);
      return;
    }

    const table = await fetchPublicTable(matchId);
    renderUnseated(root, {
      matchId,
      seats: table?.seats ?? [],
      sitFailed: true,
      onSit: () => {
        void handleSitAtTable(root, matchId);
      },
    });
  } catch {
    const table = await fetchPublicTable(matchId);
    renderUnseated(root, {
      matchId,
      seats: table?.seats ?? [],
      sitFailed: true,
      onSit: () => {
        void handleSitAtTable(root, matchId);
      },
    });
  }
}
