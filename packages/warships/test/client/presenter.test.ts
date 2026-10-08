import { describe, expect, it } from 'vitest';
import type { ShotEvent, TableSnapshot } from '../../src/protocol.js';
import { applyShot, Presenter, turnStep } from '../../src/client/presenter.js';
import type { ShotSchedule } from '../../src/client/fx/timeline.js';
import { snapshot, shotEvent } from './support.js';

/** A presenter on a fake clock: `advance(ms)` moves server time and fires due timers in order. */
function harness(options: { reduced?: boolean; now?: number } = {}) {
  let now = options.now ?? 10_000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let ids = 0;
  const presented: TableSnapshot[] = [];
  const plays: Array<{ shot: ShotEvent; schedule: ShotSchedule; elapsed: number }> = [];
  const log: string[] = [];
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
    play: (shot, schedule, elapsed) => plays.push({ shot, schedule, elapsed }),
    log: (shot, step) => log.push(`${shot.shotId} ${step}`),
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
  return { presenter, presented, plays, log, advance, last: () => presented.at(-1)!, setNow: (t: number) => (now = t) };
}

const afterShot = (shot: ShotEvent, extra: Partial<TableSnapshot> = {}): TableSnapshot =>
  snapshot({
    version: 2,
    currentSeatId: shot.nextSeatId,
    turnNumber: shot.turnNumber,
    turnOpensAt: shot.turnOpensAt,
    lastShot: { ...shot },
    target: { seatId: '2', shots: [{ row: shot.coord.row, col: shot.coord.col, result: shot.result, turnNumber: shot.turnNumber }], sunk: [], revealed: null },
    ...extra,
  });

describe('shot presenter', () => {
  it('holds the snapshot that carries a playing shot until its animation reveals the result', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot());
    const shot = shotEvent({ result: 'hit' });
    h.presenter.onShot(shot);
    h.presenter.onSnapshot(afterShot(shot));
    expect(h.plays).toHaveLength(1);
    expect(h.plays[0]!.elapsed).toBe(0);
    expect(h.last().target!.shots).toEqual([]);
    expect(h.presenter.pendingSnapshot?.version).toBe(2);

    h.advance(1749);
    expect(h.last().target!.shots).toEqual([]);
    h.advance(1);
    // The mark lands at resolve; the turn is still the shooter's until the animation ends.
    expect(h.last().target!.shots).toEqual([{ row: 2, col: 6, result: 'hit', turnNumber: 1 }]);
    expect(h.last().currentSeatId).toBe('1');
    expect(h.presenter.busy).toBe(true);

    h.advance(450);
    expect(h.presenter.busy).toBe(false);
    expect(h.last().version).toBe(2);
    expect(h.last().currentSeatId).toBe('2');
  });

  it('logs the same steps for every captain, in order', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot());
    h.presenter.onShot(
      shotEvent({
        result: 'hit',
        coord: { row: 4, col: 1 },
        animationMs: 3800,
        sunkShip: { shipId: 'destroyer', row: 4, col: 0, orientation: 'horizontal', length: 2, sunkOnTurn: 1 },
      }),
    );
    h.advance(4000);
    expect(h.log).toEqual(['1-1 lock E2', '1-1 sweep', '1-1 track E2', '1-1 hit E2', '1-1 sunk destroyer', '1-1 turn 2:2']);
    expect(h.last().seats.find((s) => s.seatId === '2')!.shipsAfloat).toBe(4);
    expect(h.last().target!.sunk.map((s) => s.shipId)).toEqual(['destroyer']);
  });

  it('seeks a shot that arrived late, and skips one that is already over', () => {
    const h = harness({ now: 11_000 });
    h.presenter.onSnapshot(snapshot());
    h.presenter.onShot(shotEvent());
    expect(h.plays[0]!.elapsed).toBe(1000);
    expect(h.log).toEqual(['1-1 lock C7', '1-1 sweep']);
    h.advance(1200);
    expect(h.presenter.busy).toBe(false);

    h.setNow(30_000);
    h.presenter.onShot(shotEvent({ turnNumber: 2, shooter: '2', target: '1', coord: { row: 0, col: 0 }, result: 'hit', serverTs: 20_000, nextSeatId: '1' }));
    expect(h.plays).toHaveLength(1);
    expect(h.presenter.busy).toBe(false);
    expect(h.last().you!.incoming).toEqual([{ row: 0, col: 0, result: 'hit', turnNumber: 2 }]);
    expect(h.last().currentSeatId).toBe('1');
    expect(h.log.slice(-2)).toEqual(['1-2 hit A1', '1-2 turn 3:1']);
  });

  it('plays queued shots one after another and applies the newest held snapshot at the end', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot());
    const first = shotEvent();
    const second = shotEvent({ turnNumber: 2, shooter: '2', target: '1', coord: { row: 9, col: 9 }, serverTs: 10_100, nextSeatId: '1' });
    h.presenter.onShot(first);
    h.presenter.onSnapshot(afterShot(first));
    h.presenter.onShot(second);
    h.presenter.onSnapshot(afterShot(second, { version: 3 }));
    expect(h.plays.map((p) => p.shot.shotId)).toEqual(['1-1']);
    h.advance(2200);
    expect(h.plays.map((p) => p.shot.shotId)).toEqual(['1-1', '1-2']);
    // The second shot started 2 100 ms into its own timeline.
    expect(h.plays[1]!.elapsed).toBe(2100);
    h.advance(100);
    expect(h.presenter.busy).toBe(false);
    expect(h.last().version).toBe(3);
  });

  it('de-duplicates by shotId and ignores a shot a snapshot already carries', () => {
    const h = harness();
    const shot = shotEvent();
    h.presenter.onSnapshot(afterShot(shot));
    h.presenter.onShot(shot);
    expect(h.plays).toHaveLength(0);

    h.presenter.onSnapshot(snapshot({ turnNumber: 0 }));
    const fresh = shotEvent({ turnNumber: 5 });
    h.presenter.onShot(fresh);
    h.presenter.onShot(fresh);
    expect(h.plays).toHaveLength(1);
  });

  it('applies snapshots straight away when nothing is playing', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot({ version: 7 }));
    h.presenter.onSnapshot(snapshot({ version: 8 }));
    expect(h.presented.map((s) => s.version)).toEqual([7, 8]);
  });

  it('catches up at once when timers were throttled in a background tab', () => {
    const h = harness();
    h.presenter.onSnapshot(snapshot());
    h.presenter.onShot(shotEvent());
    h.setNow(20_000);
    h.presenter.catchUp();
    expect(h.presenter.busy).toBe(false);
    expect(h.log.at(-1)).toBe('1-1 turn 2:2');
  });

  it('under reduced motion shows the mark at 400 ms and holds the turn for the full animation', () => {
    const h = harness({ reduced: true });
    h.presenter.onSnapshot(snapshot());
    h.presenter.onShot(shotEvent());
    h.advance(399);
    expect(h.last().target!.shots).toHaveLength(0);
    h.advance(1);
    expect(h.last().target!.shots).toHaveLength(1);
    expect(h.presenter.busy).toBe(true);
    h.advance(1800);
    expect(h.presenter.busy).toBe(false);
    expect(h.log).toEqual(['1-1 lock C7', '1-1 miss C7', '1-1 turn 2:2']);
  });

  it('describes the hand-over, or the end of the game', () => {
    expect(turnStep(shotEvent())).toBe('turn 2:2');
    expect(turnStep(shotEvent({ gameOver: true, nextSeatId: null, winnerSeatId: '1' }))).toBe('game over 1');
  });
});

describe('applyShot', () => {
  it('folds a shot into whichever board the viewer owns, and only what the event says', () => {
    const own = applyShot(snapshot(), shotEvent({ shooter: '2', target: '1', coord: { row: 0, col: 0 }, result: 'hit' }), ['mark']);
    expect(own.you!.incoming).toEqual([{ row: 0, col: 0, result: 'hit', turnNumber: 1 }]);
    expect(own.target!.shots).toEqual([]);

    const sunk = { shipId: 'destroyer' as const, row: 0, col: 9, orientation: 'vertical' as const, length: 2, sunkOnTurn: 1 };
    const theirs = applyShot(snapshot(), shotEvent({ result: 'hit', coord: { row: 1, col: 9 }, sunkShip: sunk }), ['mark', 'sunk']);
    expect(theirs.target!.sunk).toEqual([sunk]);
    expect(theirs.target!.revealed).toBeNull();
    expect(theirs.seats.find((s) => s.seatId === '2')!.shipsAfloat).toBe(4);
    // Marks never name a ship.
    expect(Object.keys(theirs.target!.shots[0]!)).toEqual(['row', 'col', 'result', 'turnNumber']);
  });

  it('does not double-apply, and leaves another game alone', () => {
    const once = applyShot(snapshot(), shotEvent(), ['mark']);
    expect(applyShot(once, shotEvent(), ['mark']).target!.shots).toHaveLength(1);
    expect(applyShot(snapshot(), shotEvent({ gameNumber: 2 }), ['mark'])).toEqual(snapshot());
  });
});
