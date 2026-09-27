import './styles.css';
import type { LegalActionOption } from './actions-bar.js';
import { attachSharedPlay, isSharedPlayUrlPath, parsePlayUrlMatchId } from './play-url.js';
import { acceptSeatCapabilityPostMessage, seatScopedFetch } from './seat-capability.js';
import { renderHandComplete, renderShowdown } from './hand-complete.js';
import { renderEmbedError, type EmbedErrorReason } from './surfaces/embed-error.js';
import { renderHandInProgress } from './surfaces/hand-in-progress.js';
import { renderLoading } from './surfaces/loading.js';
import { renderMyTurn } from './surfaces/my-turn.js';
import { renderTableShell } from './surfaces/table-shell.js';
import { isTableRefreshMessage, postTableChangedToParent } from './table-refresh.js';
import {
  attachPublicTableNotify,
  type PublicTableNotifyHandle,
} from './table-notify.js';
import { identityAuthHeaders, readStoredSession } from './identity/session.js';

const BOOTSTRAP_HASH_PREFIX = '#bt=';

export function parseBootstrapTokenFromHash(hash: string): string | undefined {
  if (!hash.startsWith(BOOTSTRAP_HASH_PREFIX)) {
    return undefined;
  }
  const raw = hash.slice(BOOTSTRAP_HASH_PREFIX.length);
  if (!raw) {
    return undefined;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export function stripBootstrapHash(): void {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.pathname + url.search);
}

export interface SessionResponse {
  matchId: string;
  bound: true;
}

export interface RedeemErrorBody {
  error: EmbedErrorReason;
  message?: string;
}

export async function redeemBootstrapToken(token: string): Promise<
  | { ok: true; session: SessionResponse }
  | { ok: false; reason: EmbedErrorReason }
> {
  const response = await fetch('/v1/bootstrap/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    let reason: EmbedErrorReason = 'attach_failed';
    try {
      const body = (await response.json()) as RedeemErrorBody;
      if (body.error) {
        reason = body.error;
      }
    } catch {
      // keep attach_failed
    }
    return { ok: false, reason };
  }

  const session = (await response.json()) as SessionResponse;
  return { ok: true, session };
}

export async function fetchExistingSession(): Promise<
  | { ok: true; session: SessionResponse }
  | { ok: false; reason: EmbedErrorReason }
> {
  const response = await fetch('/v1/bootstrap/session', {
    method: 'GET',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    return { ok: false, reason: 'invalid_session' };
  }

  const session = (await response.json()) as SessionResponse;
  return { ok: true, session };
}

export function rejectPostMessageBootstrap(): void {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (
      data &&
      typeof data === 'object' &&
      ('token' in data || 'bootstrapToken' in data || 'bt' in data)
    ) {
      // Deliberately ignore postMessage bootstrap attempts.
      event.stopImmediatePropagation();
    }
  });
}

type PublicTableSeat = { seatId: string; stack?: number };

type SeatTableResponse = {
  matchId: string;
  seatId: string;
  hole: [string, string] | null;
  currentSeat: string | null;
  pot?: number;
  board?: string[];
  seats: PublicTableSeat[];
  legalActions?: LegalActionOption[];
  completeReason?: 'fold_to_one' | 'showdown';
  winners?: Array<{ seatId: string; amount: number }>;
  shownHoles?: Array<{ seatId: string; hole: [string, string] }>;
};

let boundPlayRoot: HTMLElement | undefined;
let boundMatchId = '';
let tableRefreshListenerBound = false;
let tableNotifyHandle: PublicTableNotifyHandle | undefined;

export function resetPlayBindings(): void {
  tableNotifyHandle?.disconnect();
  tableNotifyHandle = undefined;
  boundPlayRoot = undefined;
  boundMatchId = '';
}

function acceptTableRefreshPostMessage(): void {
  if (tableRefreshListenerBound) {
    return;
  }
  tableRefreshListenerBound = true;
  window.addEventListener('message', (event) => {
    if (!event.origin || event.origin !== window.location.origin) {
      return;
    }
    if (!isTableRefreshMessage(event.data)) {
      return;
    }
    if (!boundPlayRoot || !boundMatchId) {
      return;
    }
    void refreshPlayTable(boundPlayRoot, boundMatchId);
  });
}

function bindWaitingTable(root: HTMLElement, matchId: string): void {
  boundPlayRoot = root;
  boundMatchId = matchId;
  renderTableShell(root, { matchId });
  tableNotifyHandle?.disconnect();
  tableNotifyHandle = attachPublicTableNotify({
    matchId,
    onRefresh: () => refreshPlayTable(root, matchId),
  });
}

async function loadLegacySeatTable(matchId: string): Promise<SeatTableResponse | undefined> {
  const publicResponse = await fetch(`/v1/table?matchId=${encodeURIComponent(matchId)}`, {
    credentials: 'same-origin',
  });
  if (!publicResponse.ok) {
    return undefined;
  }

  const publicTable = (await publicResponse.json()) as { seats?: PublicTableSeat[] };
  for (const seat of publicTable.seats ?? []) {
    const seatResponse = await seatScopedFetch(
      `/v1/seats/${encodeURIComponent(seat.seatId)}/table?matchId=${encodeURIComponent(matchId)}`,
    );
    if (!seatResponse.ok) {
      continue;
    }
    return (await seatResponse.json()) as SeatTableResponse;
  }

  return undefined;
}

async function loadSharedPlaySeatTable(matchId: string): Promise<SeatTableResponse | undefined> {
  const session = readStoredSession();
  if (!session) {
    return undefined;
  }

  const publicResponse = await fetch(
    `/v1/play/matches/${encodeURIComponent(matchId)}/table`,
    { credentials: 'same-origin' },
  );
  if (!publicResponse.ok) {
    return undefined;
  }

  const publicTable = (await publicResponse.json()) as {
    seats?: Array<{ seatId: string; playerSubject: string | null }>;
  };
  const boundSeat = publicTable.seats?.find(
    (seat) => seat.playerSubject === session.playerSubject,
  );
  if (!boundSeat) {
    return undefined;
  }

  const seatResponse = await fetch(
    `/v1/play/matches/${encodeURIComponent(matchId)}/seats/${encodeURIComponent(boundSeat.seatId)}/table`,
    { headers: identityAuthHeaders() },
  );
  if (!seatResponse.ok) {
    return undefined;
  }

  return (await seatResponse.json()) as SeatTableResponse;
}

async function loadSeatTable(matchId: string): Promise<SeatTableResponse | undefined> {
  if (isSharedPlayUrlPath()) {
    return loadSharedPlaySeatTable(matchId);
  }
  return loadLegacySeatTable(matchId);
}

function facingBetFromActions(legalActions: LegalActionOption[] | undefined): boolean {
  return Boolean(legalActions?.some((action) => action.type === 'call' || action.type === 'raise'));
}

function sharedTableChrome(table: SeatTableResponse) {
  const opponents = table.seats
    .filter((seat) => seat.seatId !== table.seatId)
    .map((seat, index) => ({
      seatId: seat.seatId,
      label: `Seat ${index + 2}`,
      stack: seat.stack !== undefined ? String(seat.stack) : '',
    }));

  const stacks = table.seats
    .filter((seat) => seat.stack !== undefined)
    .map((seat) => ({ seatId: seat.seatId, stack: seat.stack as number }));

  return { opponents, stacks };
}

export function renderFromSeatTable(root: HTMLElement, table: SeatTableResponse): void {
  if (!table.hole) {
    return;
  }

  const { opponents, stacks } = sharedTableChrome(table);

  if (table.completeReason === 'showdown') {
    renderShowdown(root, {
      matchId: table.matchId,
      seatId: table.seatId,
      hole: table.hole,
      board: table.board,
      pot: table.pot,
      winners: table.winners,
      shownHoles: table.shownHoles,
    });
    return;
  }

  if (table.completeReason === 'fold_to_one') {
    renderHandComplete(root, {
      matchId: table.matchId,
      seatId: table.seatId,
      hole: table.hole,
      board: table.board,
      winners: table.winners,
      shownHoles: table.shownHoles,
      completeReason: table.completeReason,
    });
    return;
  }

  const myTurn =
    table.currentSeat === table.seatId &&
    Array.isArray(table.legalActions) &&
    table.legalActions.length > 0;

  if (myTurn) {
    renderMyTurn(root, {
      matchId: table.matchId,
      seatId: table.seatId,
      hole: table.hole,
      board: table.board,
      opponents,
      pot: table.pot,
      stacks,
      legalActions: table.legalActions,
      facingBet: facingBetFromActions(table.legalActions),
      onSubmitAction: (nextAction) => submitPlayAction(root, table, nextAction),
    });
    return;
  }

  renderHandInProgress(root, {
    matchId: table.matchId,
    seatId: table.seatId,
    hole: table.hole,
    board: table.board,
    opponents,
    pot: table.pot,
    stacks,
    showDisabledActionsBar: true,
    facingBet: table.currentSeat !== null && table.currentSeat !== table.seatId,
  });
}

export async function submitPlayAction(
  root: HTMLElement,
  table: Pick<SeatTableResponse, 'matchId' | 'seatId'>,
  action: { type: string; amount?: number },
): Promise<void> {
  if (!readStoredSession()) {
    return;
  }

  const response = await fetch(
    `/v1/play/matches/${encodeURIComponent(table.matchId)}/seats/${encodeURIComponent(table.seatId)}/actions`,
    {
      method: 'POST',
      headers: identityAuthHeaders(),
      body: JSON.stringify({ action }),
    },
  );
  if (!response.ok) {
    return;
  }

  const seatTable = (await response.json()) as SeatTableResponse;
  renderFromSeatTable(root, seatTable);
  postTableChangedToParent();
}

export async function refreshPlayTable(root: HTMLElement, matchId: string): Promise<void> {
  try {
    const table = await loadSeatTable(matchId);
    if (!table?.hole) {
      return;
    }

    renderFromSeatTable(root, table);
  } catch {
    // Stay on the waiting-for-deal shell if the table cannot be read yet.
  }
}

export async function bootstrapPlay(root: HTMLElement): Promise<void> {
  rejectPostMessageBootstrap();
  acceptSeatCapabilityPostMessage();
  acceptTableRefreshPostMessage();
  renderLoading(root);

  const token = parseBootstrapTokenFromHash(window.location.hash);

  if (token) {
    const result = await redeemBootstrapToken(token);
    stripBootstrapHash();

    if (!result.ok) {
      renderEmbedError(root, result.reason);
      return;
    }

    bindWaitingTable(root, result.session.matchId);
    return;
  }

  const sessionResult = await fetchExistingSession();
  if (sessionResult.ok) {
    bindWaitingTable(root, sessionResult.session.matchId);
    return;
  }

  renderEmbedError(root, 'missing_token');
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) {
    if (parsePlayUrlMatchId(window.location.pathname) !== undefined) {
      void attachSharedPlay(root);
    } else {
      void bootstrapPlay(root);
    }
  }
}
