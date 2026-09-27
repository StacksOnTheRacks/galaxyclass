import { fetchPublicTable, handleSitAtTable } from './sit.js';
import { renderEmbedError } from './surfaces/embed-error.js';
import { renderLoading } from './surfaces/loading.js';
import { renderUnseated } from './surfaces/unseated.js';
import { isTableChangedMessage, isTableRefreshMessage } from './table-refresh.js';
import {
  attachPublicTableNotify,
  type PublicTableNotifyHandle,
} from './table-notify.js';

const PLAY_PATH_RE = /^\/play\/([^/]+)\/?$/;

const FORBIDDEN_MESSAGE_KEYS = new Set([
  'token',
  'bootstrapToken',
  'bt',
  'capability',
  'attach',
  'sit',
  'grant',
]);

let sharedPostMessageBound = false;
let sharedTableNotifyHandle: PublicTableNotifyHandle | undefined;

export function parsePlayUrlMatchId(pathname: string): string | undefined {
  const match = pathname.match(PLAY_PATH_RE);
  return match?.[1];
}

export function isSharedPlayUrlPath(pathname: string = window.location.pathname): boolean {
  return parsePlayUrlMatchId(pathname) !== undefined;
}

export function isEmbedChrome(search: string): boolean {
  return new URLSearchParams(search).get('embed') === '1';
}

export function readEmbedAncestorOrigins(): string[] {
  const meta = document.querySelector('meta[name="riffle-embed-ancestors"]');
  if (!meta) {
    return [];
  }
  const content = meta.getAttribute('content') ?? '';
  return content.split(/\s+/).filter((origin) => origin.length > 0);
}

export function acceptSharedPlayPostMessage(allowedOrigins: string[]): void {
  if (sharedPostMessageBound) {
    return;
  }
  sharedPostMessageBound = true;

  const allowSet = new Set(allowedOrigins);

  window.addEventListener('message', (event) => {
    if (!event.origin || !allowSet.has(event.origin)) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    for (const key of Object.keys(data)) {
      if (FORBIDDEN_MESSAGE_KEYS.has(key)) {
        return;
      }
    }

    if (!isTableRefreshMessage(data) && !isTableChangedMessage(data)) {
      return;
    }
  });
}

export function resetSharedPlayBindings(): void {
  sharedPostMessageBound = false;
  sharedTableNotifyHandle?.disconnect();
  sharedTableNotifyHandle = undefined;
}

export async function lookupPlayMatch(matchId: string): Promise<boolean> {
  const response = await fetch(`/v1/play/matches/${encodeURIComponent(matchId)}`, {
    credentials: 'same-origin',
  });
  return response.ok;
}

export async function attachSharedPlay(root: HTMLElement): Promise<void> {
  if (isEmbedChrome(window.location.search)) {
    document.documentElement.dataset.embed = '1';
  }

  const matchId = parsePlayUrlMatchId(window.location.pathname);
  if (!matchId) {
    renderEmbedError(root, 'match_not_found');
    return;
  }

  const allowedOrigins = [window.location.origin, ...readEmbedAncestorOrigins()];
  acceptSharedPlayPostMessage(allowedOrigins);

  renderLoading(root, { copy: 'shared' });

  const found = await lookupPlayMatch(matchId);
  if (!found) {
    renderEmbedError(root, 'match_not_found');
    return;
  }

  const table = await fetchPublicTable(matchId);
  renderUnseated(root, {
    matchId,
    seats: table?.seats ?? [],
    onSit: () => {
      void handleSitAtTable(root, matchId);
    },
  });

  sharedTableNotifyHandle?.disconnect();
  sharedTableNotifyHandle = attachPublicTableNotify({
    matchId,
    onRefresh: async () => {
      const refreshed = await fetchPublicTable(matchId);
      if (root.dataset.surface !== 'unseated') {
        return;
      }
      renderUnseated(root, {
        matchId,
        seats: refreshed?.seats ?? [],
        onSit: () => {
          void handleSitAtTable(root, matchId);
        },
      });
    },
  });
}
