import type { ShotEvent, TableSnapshot } from '../protocol.js';
import type { Coord } from '../rules/types.js';
import { draftFromFleet, EMPTY_DRAFT, type Draft } from './draft.js';

const FX_LOG_LIMIT = 500;

/** Client-side table state: what is shown, the fleet being arranged, and the shot log. */
export class TableModel {
  /** Newest snapshot from the server. */
  latest: TableSnapshot | null = null;
  /** What the boards show: the latest snapshot, minus results a playing shot has not revealed yet. */
  presented: TableSnapshot | null = null;
  draft: Draft = EMPTY_DRAFT;
  /** The game the draft belongs to; a rematch starts a fresh one. */
  private draftGame: number | null = null;
  /** The shooter's own reticle while their `fire` is in flight. */
  pendingTarget: Coord | null = null;
  offline = false;
  playing: ShotEvent | null = null;
  /** Dev and e2e: every shot step in order, e.g. `lock C7`, `sweep`, `track C7`, `hit C7`, `sunk cruiser`, `turn 3:2`. */
  readonly fxLog: string[] = [];
  /** The same steps keyed by `shotId`, for comparing two captains' playback. */
  readonly fxShots: Record<string, string[]> = {};

  constructor(readonly tableId: string) {}

  /** Dev hook and e2e: the snapshot the captain is looking at, turn hand-over included. */
  get snapshot(): TableSnapshot | null {
    return this.presented;
  }

  present(snapshot: TableSnapshot): void {
    this.presented = snapshot;
    if (this.draftGame !== snapshot.gameNumber) {
      this.draftGame = snapshot.gameNumber;
      this.draft = snapshot.you?.fleet ? draftFromFleet(snapshot.you.fleet) : EMPTY_DRAFT;
    } else if (snapshot.you?.ready && snapshot.you.fleet) {
      this.draft = draftFromFleet(snapshot.you.fleet);
    }
    if (snapshot.status !== 'battle') {
      this.pendingTarget = null;
    }
  }

  logFx(shotId: string, step: string): void {
    this.fxLog.push(step);
    if (this.fxLog.length > FX_LOG_LIMIT) {
      this.fxLog.splice(0, this.fxLog.length - FX_LOG_LIMIT);
    }
    (this.fxShots[shotId] ??= []).push(step);
  }
}
