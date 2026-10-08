import type { ShotEvent, ShotRecord, TableSnapshot } from '../protocol.js';
import { COL_LABELS, ROW_LABELS } from '../rules/constants.js';
import type { Coord, ShotMark } from '../rules/types.js';
import { shotSchedule, type ShotSchedule } from './fx/timeline.js';

export function coordLabel(coord: Coord): string {
  return `${ROW_LABELS[coord.row] ?? '?'}${COL_LABELS[coord.col] ?? '?'}`;
}

export type ShotStage = 'mark' | 'sunk' | 'turn';

function toRecord(shot: ShotEvent): ShotRecord {
  const { type: _type, tableId: _tableId, nextSeatId: _next, turnOpensAt: _opens, winnerSeatId: _winner, ...record } = shot;
  return record;
}

function withMark(marks: ShotMark[], shot: ShotEvent): ShotMark[] {
  if (marks.some((mark) => mark.turnNumber === shot.turnNumber)) {
    return marks;
  }
  return [...marks, { row: shot.coord.row, col: shot.coord.col, result: shot.result, turnNumber: shot.turnNumber }];
}

/**
 * Folds one stage of a shot into the presented snapshot, so a mark can appear the moment the
 * animation lands it even while the server's own snapshot (which may already hold later shots)
 * waits. Uses only what the shot event carries: it never learns an unsunk ship's position.
 */
export function applyShot(snapshot: TableSnapshot, shot: ShotEvent, stages: readonly ShotStage[]): TableSnapshot {
  const me = snapshot.you?.seatId ?? null;
  if (!me || snapshot.gameNumber !== shot.gameNumber) {
    return snapshot;
  }
  let next: TableSnapshot = snapshot;
  if (stages.includes('mark')) {
    next = { ...next, lastShot: toRecord(shot) };
    if (shot.shooter === me && next.target) {
      next = { ...next, target: { ...next.target, shots: withMark(next.target.shots, shot) } };
    } else if (shot.target === me && next.you) {
      next = { ...next, you: { ...next.you, incoming: withMark(next.you.incoming, shot) } };
    }
  }
  if (stages.includes('sunk') && shot.sunkShip) {
    const sunk = shot.sunkShip;
    if (shot.shooter === me && next.target && !next.target.sunk.some((ship) => ship.shipId === sunk.shipId)) {
      next = { ...next, target: { ...next.target, sunk: [...next.target.sunk, sunk] } };
    }
    next = {
      ...next,
      seats: next.seats.map((seat) =>
        seat.seatId === shot.target && seat.shipsAfloat !== null && seat.shipsAfloat > 0
          ? { ...seat, shipsAfloat: seat.shipsAfloat - 1 }
          : seat,
      ),
    };
  }
  if (stages.includes('turn')) {
    next = {
      ...next,
      currentSeatId: shot.nextSeatId,
      turnNumber: Math.max(next.turnNumber, shot.turnNumber),
      turnOpensAt: shot.turnOpensAt,
      winnerSeatId: shot.winnerSeatId ?? next.winnerSeatId,
    };
  }
  return next;
}

export interface PresenterHost {
  /** Server epoch ms, from the clock-offset estimate. */
  serverNow(): number;
  reducedMotion(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** What the boards and HUD should show now. */
  present(snapshot: TableSnapshot): void;
  /** Start the visual timeline for a shot, already `elapsed` ms in. */
  play(shot: ShotEvent, schedule: ShotSchedule, elapsed: number): void;
  /** Abandon any running visuals (reset). */
  stop?(): void;
  /** One step of the shot, identical on both clients for the same shot. */
  log(shot: ShotEvent, step: string): void;
}

interface Cue {
  at: number;
  run(): void;
}

interface Playing {
  shot: ShotEvent;
  schedule: ShotSchedule;
  cues: Cue[];
  timer: unknown;
}

/**
 * The shot playback queue. While a shot plays, incoming snapshots are held back (the newest wins)
 * and the shot's own result is folded in at its resolve, sink, and turn boundaries; the held
 * snapshot is applied once the queue drains. Shots play FIFO, de-duplicated by `shotId`; a shot
 * that arrives after its animation would have ended is applied at once.
 */
export class Presenter {
  presented: TableSnapshot | null = null;
  private deferred: TableSnapshot | null = null;
  private queue: ShotEvent[] = [];
  private playing: Playing | null = null;
  private readonly seen = new Set<string>();

  constructor(private readonly host: PresenterHost) {}

  get busy(): boolean {
    return this.playing !== null || this.queue.length > 0;
  }

  get current(): ShotEvent | null {
    return this.playing?.shot ?? null;
  }

  get pendingSnapshot(): TableSnapshot | null {
    return this.deferred;
  }

  onSnapshot(snapshot: TableSnapshot): void {
    if (this.busy) {
      this.deferred = snapshot;
      return;
    }
    this.show(snapshot);
  }

  onShot(shot: ShotEvent): void {
    if (this.seen.has(shot.shotId)) {
      return;
    }
    this.seen.add(shot.shotId);
    const presented = this.presented;
    if (!this.busy && presented && presented.gameNumber === shot.gameNumber && presented.turnNumber >= shot.turnNumber) {
      // A snapshot (say, after a reconnect) already carries this shot.
      return;
    }
    this.queue.push(shot);
    if (!this.playing) {
      this.next();
    }
  }

  /** Timers may have been throttled in a background tab: run everything that is due. */
  catchUp(): void {
    if (this.playing) {
      this.host.clearTimeout(this.playing.timer);
      this.run();
    }
  }

  reset(): void {
    if (this.playing) {
      this.host.clearTimeout(this.playing.timer);
    }
    this.playing = null;
    this.queue = [];
    this.host.stop?.();
    if (this.deferred) {
      const held = this.deferred;
      this.deferred = null;
      this.show(held);
    }
  }

  private show(snapshot: TableSnapshot): void {
    if (snapshot.lastShot) {
      this.seen.add(snapshot.lastShot.shotId);
    }
    this.presented = snapshot;
    this.host.present(snapshot);
  }

  private fold(shot: ShotEvent, stages: readonly ShotStage[]): void {
    if (this.presented) {
      this.presented = applyShot(this.presented, shot, stages);
      this.host.present(this.presented);
    }
  }

  private next(): void {
    const shot = this.queue.shift();
    if (!shot) {
      this.playing = null;
      if (this.deferred) {
        const held = this.deferred;
        this.deferred = null;
        this.show(held);
      }
      return;
    }
    const schedule = shotSchedule({
      animationMs: shot.animationMs,
      sunk: Boolean(shot.sunkShip),
      reduced: this.host.reducedMotion(),
    });
    const label = coordLabel(shot.coord);
    const elapsed = this.host.serverNow() - shot.serverTs;
    const log = (step: string) => this.host.log(shot, step);

    if (elapsed >= schedule.total) {
      log(`${shot.result} ${label}`);
      if (shot.sunkShip) {
        log(`sunk ${shot.sunkShip.shipId}`);
      }
      log(turnStep(shot));
      this.fold(shot, ['mark', 'sunk', 'turn']);
      this.next();
      return;
    }

    const cues: Cue[] = [{ at: 0, run: () => log(`lock ${label}`) }];
    for (const p of schedule.phases) {
      if (p.name === 'sweep') {
        cues.push({ at: p.start, run: () => log('sweep') });
      } else if (p.name === 'track') {
        cues.push({ at: p.start, run: () => log(`track ${label}`) });
      }
    }
    cues.push({
      at: schedule.resolveAt,
      run: () => {
        log(`${shot.result} ${label}`);
        this.fold(shot, ['mark']);
      },
    });
    if (shot.sunkShip && schedule.sinkAt !== null) {
      const shipId = shot.sunkShip.shipId;
      cues.push({
        at: schedule.sinkAt,
        run: () => {
          log(`sunk ${shipId}`);
          this.fold(shot, ['sunk']);
        },
      });
    }
    cues.push({
      at: schedule.total,
      run: () => {
        log(turnStep(shot));
        // Idle before the fold, so the render it triggers already shows the open turn.
        this.playing = null;
        this.fold(shot, ['turn']);
        this.next();
      },
    });
    cues.sort((a, b) => a.at - b.at);

    this.playing = { shot, schedule, cues, timer: null };
    this.host.play(shot, schedule, Math.max(0, elapsed));
    this.run();
  }

  private run(): void {
    const playing = this.playing;
    if (!playing) {
      return;
    }
    const elapsed = this.host.serverNow() - playing.shot.serverTs;
    while (playing.cues.length > 0 && playing.cues[0]!.at <= elapsed) {
      playing.cues.shift()!.run();
      if (this.playing !== playing) {
        return;
      }
    }
    const due = playing.cues[0];
    if (due) {
      playing.timer = this.host.setTimeout(() => this.run(), Math.max(0, due.at - elapsed));
    }
  }
}

/** `turn <next turn number>:<next seat>`, or `game over <winner>`. */
export function turnStep(shot: ShotEvent): string {
  return shot.gameOver || !shot.nextSeatId ? `game over ${shot.winnerSeatId ?? '-'}` : `turn ${shot.turnNumber + 1}:${shot.nextSeatId}`;
}
