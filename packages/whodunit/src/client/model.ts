import type { ClientActionName, EventMessage, TableSnapshot } from '../protocol.js';

const FX_LOG_LIMIT = 500;

/** Client-side table state: what is shown, the action in flight, and the animation log. */
export class TableModel {
  /** Newest snapshot from the server. */
  latest: TableSnapshot | null = null;
  /** What the board and panel show: the latest snapshot, minus results a playing event has not revealed yet. */
  presented: TableSnapshot | null = null;
  /** The action sent and not yet answered by a snapshot or an error; its button stays disabled. */
  pending: ClientActionName | null = null;
  offline = false;
  playing: EventMessage | null = null;
  /** Dev and e2e: every animation step in order, e.g. `rolled 2 3+4`, `walk 2 7`, `land 2 room:parlor`. */
  readonly fxLog: string[] = [];
  /** The same steps keyed by `eventId`, for comparing two detectives' playback. */
  readonly fxEvents: Record<string, string[]> = {};

  constructor(readonly tableId: string) {}

  /** Dev hook and e2e: the snapshot the detective is looking at. */
  get snapshot(): TableSnapshot | null {
    return this.presented;
  }

  present(snapshot: TableSnapshot): void {
    if (this.presented && snapshot.version !== this.presented.version) {
      this.pending = null;
    }
    this.presented = snapshot;
  }

  logFx(eventId: string, step: string): void {
    this.fxLog.push(step);
    if (this.fxLog.length > FX_LOG_LIMIT) {
      this.fxLog.splice(0, this.fxLog.length - FX_LOG_LIMIT);
    }
    (this.fxEvents[eventId] ??= []).push(step);
  }
}
