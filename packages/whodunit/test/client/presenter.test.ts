import { describe, expect, it } from 'vitest';
import type { EventSchedule } from '../../src/client/fx/timeline.js';
import { applyEvent, eventStep, Presenter } from '../../src/client/presenter.js';
import type { EventMessage, TableSnapshot } from '../../src/protocol.js';
import { startPositions } from '../../src/rules/board.js';
import { eventMessage, snapshot, turn, you } from './support.js';

/** A presenter on a fake clock: `advance(ms)` moves server time and fires due timers in order. */
function harness(options: { reduced?: boolean; now?: number } = {}) {
  let now = options.now ?? 10_000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let ids = 0;
  const presented: TableSnapshot[] = [];
  const plays: Array<{ message: EventMessage; schedule: EventSchedule; elapsed: number; before: TableSnapshot | null }> = [];
  const log: string[] = [];
  let stops = 0;
  const presenter = new Presenter({
    serverNow: () => now,
    reducedMotion: () => options.reduced ?? false,
    setTimeout: (fn, ms) => {
      const id = ++ids;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      const index = timers.findIndex((t) => t.id === id);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
    present: (s) => presented.push(s),
    play: (message, schedule, elapsed, before) => plays.push({ message, schedule, elapsed, before }),
    stop: () => void stops++,
    log: (event, step) => log.push(`${event.eventId} ${step}`),
  });
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > until) {
        break;
      }
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = until;
  };
  return { presenter, presented, plays, log, advance, last: () => presented.at(-1)!, stops: () => stops };
}

const walk = () =>
  eventMessage(
    {
      kind: 'moved',
      seatId: '1',
      suspect: 'vesper',
      via: 'walk',
      path: [
        { kind: 'hall', x: 7, y: 0 },
        { kind: 'hall', x: 7, y: 1 },
        { kind: 'hall', x: 7, y: 2 },
      ],
      seq: 11,
      animationMs: 1240,
    },
    { currentSeatId: '1', nextActionAt: 10_000 + 1240 },
  );

describe('event presenter', () => {
  it('walks the token, folds the landing in as the walk ends, and holds the server snapshot until the end', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot({ turn: turn({ phase: 'moving', dice: [1, 1] }) }));
    const message = walk();
    h.presenter.onEvent(message);
    const after = snapshot({ version: 2, positions: { ...startPositions(), vesper: { kind: 'hall', x: 7, y: 2 } }, turn: turn({ phase: 'moved', dice: [1, 1] }), log: [message.event] });
    h.presenter.onSnapshot(after);
    expect(h.plays).toHaveLength(1);
    expect(h.plays[0]!.elapsed).toBe(0);
    expect(h.plays[0]!.before?.positions?.vesper).toEqual({ kind: 'hall', x: 7, y: 0 });
    expect(h.presenter.pendingSnapshot?.version).toBe(2);

    // The walk ends at lead (450) + 2 × 170 = 790.
    h.advance(789);
    expect(h.last().positions!.vesper).toEqual({ kind: 'hall', x: 7, y: 0 });
    h.advance(1);
    expect(h.last().positions!.vesper).toEqual({ kind: 'hall', x: 7, y: 2 });
    expect(h.last().turn!.phase).toBe('moved');
    expect(h.presenter.busy).toBe(true);
    expect(h.log).toEqual(['1-11 walk 1 2 hall:7,2']);

    h.advance(450);
    expect(h.presenter.busy).toBe(false);
    expect(h.last().version).toBe(2);
    expect(h.log).toEqual(['1-11 walk 1 2 hall:7,2', '1-11 done 1-11']);
  });

  it('joins a late arrival mid-event, seeked to the shared clock', () => {
    const h = harness({ now: 10_500 });
    h.presenter.onSnapshot(snapshot());
    h.presenter.onEvent(walk());
    expect(h.plays[0]!.elapsed).toBe(500);
    h.advance(290);
    expect(h.last().positions!.vesper).toEqual({ kind: 'hall', x: 7, y: 2 });
  });

  it('applies an event whose animation has already ended at once, and never plays one twice', () => {
    const h = harness({ now: 20_000 });
    h.presenter.onSnapshot(snapshot());
    const message = walk();
    h.presenter.onEvent(message);
    h.presenter.onEvent(message);
    expect(h.plays).toHaveLength(0);
    expect(h.last().positions!.vesper).toEqual({ kind: 'hall', x: 7, y: 2 });
    expect(h.log).toEqual(['1-11 walk 1 2 hall:7,2', '1-11 done 1-11']);
  });

  it('skips an event the snapshot already carries (after a reconnect)', () => {
    const h = harness();
    const message = walk();
    h.presenter.onSnapshot(snapshot({ log: [message.event] }));
    h.presenter.onEvent(message);
    expect(h.plays).toHaveLength(0);
    expect(h.presenter.busy).toBe(false);
  });

  it('plays the events of one action in order, each on its own delay', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot());
    const roll = eventMessage({ kind: 'rolled', seatId: '1', dice: [3, 4], seq: 21, animationMs: 1400 });
    const pass = eventMessage({ kind: 'turn_passed', seatId: '1', nextSeatId: '2', seq: 22, delayMs: 1400, animationMs: 700 }, { currentSeatId: '2' });
    h.presenter.onEvent(roll);
    h.presenter.onEvent(pass);
    expect(h.plays.map((p) => p.message.event.kind)).toEqual(['rolled']);
    h.advance(1400);
    expect(h.plays.map((p) => p.message.event.kind)).toEqual(['rolled', 'turn_passed']);
    expect(h.last().turn!.dice).toEqual([3, 4]);
    h.advance(700);
    expect(h.last().currentSeatId).toBe('2');
    expect(h.last().turn).toEqual(turn());
    expect(h.presenter.busy).toBe(false);
  });

  it('cuts to the result early under reduced motion, but still waits the full span before the next event', () => {
    const h = harness({ reduced: true });
    h.presenter.onSnapshot(snapshot());
    h.presenter.onEvent(walk());
    h.advance(400);
    expect(h.last().positions!.vesper).toEqual({ kind: 'hall', x: 7, y: 2 });
    expect(h.presenter.busy).toBe(true);
    h.advance(840);
    expect(h.presenter.busy).toBe(false);
  });

  it('drops everything on reset and shows the held snapshot', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot());
    h.presenter.onEvent(walk());
    h.presenter.onSnapshot(snapshot({ version: 9 }));
    h.presenter.reset();
    expect(h.stops()).toBe(1);
    expect(h.last().version).toBe(9);
    expect(h.presenter.busy).toBe(false);
  });
});

describe('applyEvent', () => {
  it('pulls the named suspect and weapon into the room and opens the refute', () => {
    const message = eventMessage({
      kind: 'suggested',
      seatId: '1',
      suspect: 'rook',
      weapon: 'telescope',
      room: 'parlor',
      suspectFrom: { kind: 'hall', x: 23, y: 18 },
      weaponFrom: 'observatory',
      pulledSeatId: '3',
      passed: ['2'],
      refuterSeatId: '3',
    });
    const next = applyEvent(snapshot(), message, ['result']);
    expect(next.positions!.rook).toEqual({ kind: 'room', room: 'parlor' });
    expect(next.weapons!.telescope).toBe('parlor');
    expect(next.pulledIn).toEqual(['3']);
    expect(next.turn).toMatchObject({ phase: 'refuting', refuterSeatId: '3', passed: ['2'] });
    expect(next.log).toHaveLength(1);
  });

  it('closes your refute prompt once the card is shown, and marks a wrong accuser out', () => {
    const refuting = snapshot({
      you: you({ refute: { suggesterSeatId: '2', suggestion: { suspect: 'rook', weapon: 'vial', room: 'parlor' }, matching: ['rook'] } }),
    });
    const shown = applyEvent(refuting, eventMessage({ kind: 'refuted', suggesterSeatId: '2', refuterSeatId: '1', card: 'rook' }), ['result']);
    expect(shown.you!.refute).toBeNull();
    expect(shown.turn!.phase).toBe('suggested');
    const wrong = applyEvent(snapshot(), eventMessage({ kind: 'accused', seatId: '2', suspect: 'rook', weapon: 'vial', room: 'parlor', correct: false }), ['result']);
    expect(wrong.seats.find((s) => s.seatId === '2')!.eliminated).toBe(true);
  });

  it('ignores an event from another case', () => {
    const before = snapshot();
    expect(applyEvent(before, eventMessage({ kind: 'rolled', seatId: '1', dice: [1, 1], gameNumber: 2 }), ['result', 'done'])).toBe(before);
  });

  it('names every step the same way for every detective', () => {
    expect(eventStep(eventMessage({ kind: 'rolled', seatId: '2', dice: [3, 4] }).event)).toBe('rolled 2 3+4');
    expect(eventStep(eventMessage({ kind: 'refuted', suggesterSeatId: '3', refuterSeatId: '4' }).event)).toBe('refuted 4>3');
    expect(eventStep(eventMessage({ kind: 'accused', seatId: '2', suspect: 'rook', weapon: 'vial', room: 'parlor', correct: true }).event)).toBe('accuse 2 correct');
  });
});
