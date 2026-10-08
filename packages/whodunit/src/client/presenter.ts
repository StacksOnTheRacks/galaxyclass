import type { EventMessage, GameEvent, PublicTurn, TableSnapshot } from '../protocol.js';
import { positionKey } from '../rules/board.js';
import { eventSchedule, type EventSchedule } from './fx/timeline.js';

export type EventStage = 'result' | 'done';

function freshTurn(): PublicTurn {
  return { phase: 'start', dice: null, enteredRoom: null, suggestion: null, refuterSeatId: null, passed: [] };
}

function withLog(snapshot: TableSnapshot, event: GameEvent): TableSnapshot {
  if (snapshot.log.some((entry) => entry.eventId === event.eventId)) {
    return snapshot;
  }
  return { ...snapshot, log: [...snapshot.log, event] };
}

function markSeat(snapshot: TableSnapshot, seatId: string, patch: { eliminated?: boolean; handSize?: number | null }): TableSnapshot {
  return { ...snapshot, seats: snapshot.seats.map((seat) => (seat.seatId === seatId ? { ...seat, ...patch } : seat)) };
}

/**
 * Folds one stage of an event into the presented snapshot, so a token lands the moment its walk
 * ends even while the server's own snapshot (which may already hold later events) waits. Uses only
 * what the event carries, already redacted for this viewer: a shown card appears only if it was ours to see.
 */
export function applyEvent(snapshot: TableSnapshot, message: EventMessage, stages: readonly EventStage[]): TableSnapshot {
  const event = message.event;
  if (snapshot.gameNumber !== event.gameNumber || !snapshot.you) {
    return snapshot;
  }
  let next = snapshot;
  if (stages.includes('result')) {
    next = withLog(next, event);
    const turn = next.turn ?? freshTurn();
    switch (event.kind) {
      case 'game_started':
        next = { ...next, weapons: { ...event.weapons }, currentSeatId: event.firstSeatId };
        break;
      case 'rolled':
        next = { ...next, turn: { ...turn, dice: event.dice, phase: 'moving' } };
        break;
      case 'moved': {
        const to = event.path.at(-1);
        if (to && next.positions) {
          next = {
            ...next,
            positions: { ...next.positions, [event.suspect]: to },
            turn: { ...turn, phase: 'moved', enteredRoom: to.kind === 'room' ? to.room : null },
          };
        }
        break;
      }
      case 'suggested':
        next = {
          ...next,
          ...(next.positions ? { positions: { ...next.positions, [event.suspect]: { kind: 'room' as const, room: event.room } } } : {}),
          ...(next.weapons ? { weapons: { ...next.weapons, [event.weapon]: event.room } } : {}),
          pulledIn: event.pulledSeatId && !next.pulledIn.includes(event.pulledSeatId) ? [...next.pulledIn, event.pulledSeatId] : next.pulledIn,
          turn: {
            ...turn,
            phase: event.refuterSeatId ? 'refuting' : 'suggested',
            suggestion: { suspect: event.suspect, weapon: event.weapon, room: event.room },
            refuterSeatId: event.refuterSeatId,
            passed: [...event.passed],
          },
        };
        break;
      case 'refuted':
        next = { ...next, turn: { ...turn, phase: 'suggested', refuterSeatId: null } };
        if (next.you?.refute) {
          next = { ...next, you: { ...next.you, refute: null } };
        }
        break;
      case 'accused':
        if (!event.correct) {
          next = markSeat(next, event.seatId, { eliminated: true });
        }
        break;
      case 'turn_passed':
        next = {
          ...next,
          currentSeatId: event.nextSeatId,
          turnNumber: next.turnNumber + 1,
          turn: freshTurn(),
          pulledIn: next.pulledIn.filter((seatId) => seatId !== event.nextSeatId),
        };
        break;
      case 'departed':
        next = markSeat(
          { ...next, revealedCards: [...next.revealedCards, ...event.revealed.filter((card) => !next.revealedCards.includes(card))] },
          event.seatId,
          { eliminated: true },
        );
        break;
      case 'game_over':
        next = { ...next, winnerSeatId: event.winnerSeatId, endReason: event.reason, solution: event.solution };
        break;
    }
  }
  if (stages.includes('done')) {
    next = { ...next, currentSeatId: message.currentSeatId ?? next.currentSeatId, nextActionAt: message.nextActionAt };
  }
  return next;
}

export interface PresenterHost {
  /** Server epoch ms, from the clock-offset estimate. */
  serverNow(): number;
  reducedMotion(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** What the board, panel, and HUD should show now. */
  present(snapshot: TableSnapshot): void;
  /** Start the visuals for an event, already `elapsed` ms in, against the state before it. */
  play(message: EventMessage, schedule: EventSchedule, elapsed: number, before: TableSnapshot | null): void;
  /** Abandon any running visuals (reset). */
  stop?(): void;
  /** One step of the event, identical for every detective for the same event. */
  log(event: GameEvent, step: string): void;
}

interface Cue {
  at: number;
  run(): void;
}

interface Playing {
  message: EventMessage;
  schedule: EventSchedule;
  cues: Cue[];
  timer: unknown;
}

/** When an event's animation starts on the shared clock. */
export function eventStart(event: GameEvent): number {
  return event.serverTs + event.delayMs;
}

/** `rolled 2 3+4`, `walk 2 7 room:parlor`, `suggest 3 rook vial cellar` … */
export function eventStep(event: GameEvent): string {
  switch (event.kind) {
    case 'game_started':
      return `start ${event.firstSeatId}`;
    case 'rolled':
      return `rolled ${event.seatId} ${event.dice[0]}+${event.dice[1]}`;
    case 'moved':
      return `${event.via === 'passage' ? 'passage' : 'walk'} ${event.seatId} ${event.path.length - 1} ${positionKey(event.path.at(-1)!)}`;
    case 'suggested':
      return `suggest ${event.seatId} ${event.suspect} ${event.weapon} ${event.room} ${event.refuterSeatId ?? '-'}`;
    case 'refuted':
      return `refuted ${event.refuterSeatId}>${event.suggesterSeatId}`;
    case 'accused':
      return `accuse ${event.seatId} ${event.correct ? 'correct' : 'wrong'}`;
    case 'turn_passed':
      return `turn ${event.nextSeatId}`;
    case 'departed':
      return `departed ${event.seatId}`;
    case 'game_over':
      return `game over ${event.winnerSeatId ?? '-'} ${event.reason}`;
  }
}

/**
 * The event playback queue. While an event plays, incoming snapshots are held back (the newest
 * wins) and the event's own result is folded in at its resolve and end boundaries; the held
 * snapshot is applied once the queue drains. Events play FIFO, de-duplicated by `eventId`; one that
 * arrives after its animation would have ended is applied at once.
 */
export class Presenter {
  presented: TableSnapshot | null = null;
  private deferred: TableSnapshot | null = null;
  private queue: EventMessage[] = [];
  private playing: Playing | null = null;
  private readonly seen = new Set<string>();

  constructor(private readonly host: PresenterHost) {}

  get busy(): boolean {
    return this.playing !== null || this.queue.length > 0;
  }

  get current(): EventMessage | null {
    return this.playing?.message ?? null;
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

  onEvent(message: EventMessage): void {
    const { eventId } = message.event;
    if (this.seen.has(eventId)) {
      return;
    }
    this.seen.add(eventId);
    if (!this.busy && this.presented?.log.some((entry) => entry.eventId === eventId)) {
      // A snapshot (say, after a reconnect) already carries this event.
      return;
    }
    this.queue.push(message);
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
    for (const entry of snapshot.log) {
      this.seen.add(entry.eventId);
    }
    this.presented = snapshot;
    this.host.present(snapshot);
  }

  private fold(message: EventMessage, stages: readonly EventStage[]): void {
    if (this.presented) {
      this.presented = applyEvent(this.presented, message, stages);
      this.host.present(this.presented);
    }
  }

  private next(): void {
    const message = this.queue.shift();
    if (!message) {
      this.playing = null;
      if (this.deferred) {
        const held = this.deferred;
        this.deferred = null;
        this.show(held);
      }
      return;
    }
    const event = message.event;
    const schedule = eventSchedule(event, { reduced: this.host.reducedMotion() });
    const elapsed = this.host.serverNow() - eventStart(event);
    const step = eventStep(event);
    const log = (text: string) => this.host.log(event, text);

    if (elapsed >= schedule.total) {
      log(step);
      log(`done ${event.eventId}`);
      this.fold(message, ['result', 'done']);
      this.next();
      return;
    }

    const cues: Cue[] = [
      {
        at: schedule.resolveAt,
        run: () => {
          log(step);
          this.fold(message, ['result']);
        },
      },
      {
        at: schedule.total,
        run: () => {
          log(`done ${event.eventId}`);
          // Idle before the fold, so the render it triggers already shows the open turn.
          this.playing = null;
          this.fold(message, ['done']);
          this.next();
        },
      },
    ];

    this.playing = { message, schedule, cues, timer: null };
    this.host.play(message, schedule, Math.max(0, elapsed), this.presented);
    this.run();
  }

  private run(): void {
    const playing = this.playing;
    if (!playing) {
      return;
    }
    const elapsed = this.host.serverNow() - eventStart(playing.message.event);
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
