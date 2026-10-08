import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../src/protocol.js';
import { GAME_START_MS, ROLL_MS, TURN_LOCK_GRACE_MS } from '../../src/rules/constants.js';
import { seededRandom } from '../../src/rules/random.js';
import type { CardId, Solution } from '../../src/rules/types.js';
import { playOut } from '../support/play.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
beforeEach(async () => {
  h = new Harness();
  await h.seed();
});
afterEach(() => vi.restoreAllMocks());

const SOLUTION: Solution = { suspect: 'thorne', weapon: 'bust', room: 'parlor' };
const HANDS: Record<'1' | '2' | '3', CardId[]> = {
  '1': ['vesper', 'finch', 'telescope', 'vial', 'observatory', 'gallery'],
  '2': ['juniper', 'rook', 'saber', 'raygun', 'greenhouse', 'laboratory'],
  '3': ['duarte', 'trophy', 'music', 'theater', 'cellar', 'foyer'],
};

const types = (conn: string, from: number) => h.messages(conn).slice(from).map((m) => m.type);

/** Three detectives in a case with a known case file and hands; seat 1 to play. */
async function knownCase() {
  await h.setupCase();
  h.patch(() => ({ solution: SOLUTION, hands: { ...HANDS } }));
}

/** Seat 1 (vesper) stands in `room`, having walked in this turn. */
function walkedInto(room: 'cellar' | 'parlor') {
  h.patch((game) => ({
    positions: { ...game.positions, vesper: { kind: 'room', room } },
    turn: { ...game.turn!, phase: 'moved', dice: [3, 3], enteredRoom: room },
  }));
}

describe('setting up a case', () => {
  it('lets each detective pick a suspect and ready up, and the host open the case', async () => {
    const a = await h.seat('a');
    expect(h.snapshot('a')).toMatchObject({ status: 'setup', hostSeatId: '1', gameNumber: 0, players: [], turn: null });
    expect(h.snapshot('a').seats).toHaveLength(6);
    expect(h.snapshot('a').positions!.vesper).toEqual({ kind: 'hall', x: 7, y: 0 });
    const b = await h.seat('b');

    await h.send('a', { action: 'choose_suspect', seatToken: a, suspect: 'rook' });
    await h.send('b', { action: 'choose_suspect', seatToken: b, suspect: 'rook' });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'suspect_taken' });
    await h.send('b', { action: 'ready', seatToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'no_suspect' });
    await h.send('a', { action: 'ready', seatToken: a });
    expect(h.snapshot('b').seats[0]).toMatchObject({ suspect: 'rook', ready: true, isHost: true });
    expect(h.snapshot('b').seats[1]).toMatchObject({ suspect: null, ready: false, isHost: false });

    await h.send('a', { action: 'start_game', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_enough_players' });
    await h.send('b', { action: 'start_game', seatToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'not_host' });
  });

  it('makes the table’s creator the host when seated, else the lowest seat', async () => {
    await h.seat('a');
    await h.seat('b');
    expect(h.snapshot('a').hostSeatId).toBe('1');
    await h.seat('creator', { accessToken: h.tokenFor('inspector') });
    expect(h.snapshot('a').hostSeatId).toBe('3');
  });

  it('waits for every detective to be ready and connected', async () => {
    const a = await h.seat('a');
    for (const [conn, suspect] of [['b', 'finch'], ['c', 'juniper']] as const) {
      const token = await h.seat(conn);
      await h.send(conn, { action: 'choose_suspect', seatToken: token, suspect });
      await h.send(conn, { action: 'ready', seatToken: token });
    }
    await h.send('a', { action: 'choose_suspect', seatToken: a, suspect: 'vesper' });
    await h.send('a', { action: 'start_game', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'players_not_ready' });
    await h.send('a', { action: 'ready', seatToken: a });
    await h.disconnect('c');
    expect(h.snapshot('a').seats[2]).toMatchObject({ occupied: true, connected: false });
    await h.send('a', { action: 'start_game', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'players_not_ready' });
  });

  it('deals the case and shows each detective only their own hand', async () => {
    await h.setupCase();
    for (const [conn, seatId] of [['a', '1'], ['b', '2'], ['c', '3']] as const) {
      const snap = h.snapshot(conn);
      expect(snap).toMatchObject({ status: 'playing', gameNumber: 1, players: ['1', '2', '3'], currentSeatId: '1', turnNumber: 1 });
      expect(snap.you).toMatchObject({ seatId, refute: null, pulledIn: false });
      expect(snap.you!.hand).toEqual(h.game().hands[seatId]);
      expect(snap.you!.hand).toHaveLength(6);
      expect(snap.solution).toBeNull();
      expect(snap.seats.slice(0, 3).map((s) => s.handSize)).toEqual([6, 6, 6]);
      expect(snap.weapons).toEqual(h.game().weapons);
      expect(snap.turn).toEqual({ phase: 'start', dice: null, enteredRoom: null, suggestion: null, refuterSeatId: null, passed: [] });
      const [started] = h.events(conn);
      expect(started).toMatchObject({
        type: 'event',
        tableId: TABLE_ID,
        event: { kind: 'game_started', firstSeatId: '1', eventId: '1-1', animationMs: GAME_START_MS },
        currentSeatId: '1',
      });
    }
  });
});

describe('a turn', () => {
  it('sends every detective the event, then the snapshot that contains it', async () => {
    await h.setupCase();
    const before = { a: h.messages('a').length, c: h.messages('c').length };
    await h.act('a', 'roll');
    for (const conn of ['a', 'c'] as const) {
      expect(types(conn, before[conn])).toEqual(['event', 'table_snapshot']);
      const { event, nextActionAt } = h.last(conn, 'event');
      expect(event).toMatchObject({ kind: 'rolled', seatId: '1', eventId: '1-2', serverTs: h.now, delayMs: 0, animationMs: ROLL_MS });
      expect(nextActionAt).toBe(h.now + ROLL_MS - TURN_LOCK_GRACE_MS);
      expect(h.snapshot(conn).turn).toMatchObject({ phase: 'moving', dice: (event as { dice: number[] }).dice });
      expect(h.snapshot(conn).log.at(-1)).toEqual(event);
    }
  });

  it('holds the next action until the last one has played, and only for the detective whose turn it is', async () => {
    await h.setupCase();
    await h.act('a', 'roll');
    h.advance(ROLL_MS - TURN_LOCK_GRACE_MS - 1);
    await h.act('a', 'end_turn');
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'turn_not_open' });
    h.advance(1);
    await h.act('b', 'end_turn');
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'not_your_turn' });
    await h.act('a', 'end_turn');
    expect(h.last('b', 'event').event).toMatchObject({ kind: 'turn_passed', seatId: '1', nextSeatId: '2' });
    expect(h.snapshot('b')).toMatchObject({ currentSeatId: '2', turnNumber: 2 });
  });

  it('walks to a reachable destination and refuses a malformed or unreachable one', async () => {
    await h.setupCase();
    h.patch((game) => ({ turn: { ...game.turn!, phase: 'moving', dice: [2, 2] } }));
    await h.act('a', 'move', { to: 'gallery' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_destination' });
    await h.act('a', 'move', { to: { kind: 'hall', x: 40, y: 0 } });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_destination' });
    await h.act('a', 'move', { to: { kind: 'room', room: 'parlor' } });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'unreachable' });
    await h.act('a', 'move', { to: { kind: 'room', room: 'observatory' } });
    const { event } = h.last('b', 'event');
    expect(event).toMatchObject({ kind: 'moved', suspect: 'vesper', via: 'walk' });
    expect(h.snapshot('b').positions!.vesper).toEqual({ kind: 'room', room: 'observatory' });
    expect(h.snapshot('a').turn).toMatchObject({ phase: 'moved', enteredRoom: 'observatory' });
  });
});

describe('a suggestion', () => {
  it('asks the refuter privately and shows the card to the suggester alone', async () => {
    await knownCase();
    walkedInto('cellar');
    await h.act('a', 'suggest', { suspect: 'finch', weapon: 'saber' });
    for (const conn of ['a', 'b', 'c']) {
      expect(h.last(conn, 'event').event).toMatchObject({ kind: 'suggested', room: 'cellar', refuterSeatId: '2', pulledSeatId: '2' });
      expect(h.snapshot(conn).turn).toMatchObject({ phase: 'refuting', refuterSeatId: '2' });
      expect(h.snapshot(conn).positions!.finch).toEqual({ kind: 'room', room: 'cellar' });
    }
    expect(h.snapshot('b').you!.refute).toEqual({
      suggesterSeatId: '1',
      suggestion: { suspect: 'finch', weapon: 'saber', room: 'cellar' },
      matching: ['saber'],
    });
    expect(h.snapshot('b').you!.pulledIn).toBe(true);
    expect(h.snapshot('a').you!.refute).toBeNull();

    h.openTurn();
    await h.act('a', 'show_card', { card: 'telescope' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_refuter' });
    await h.act('b', 'show_card', { card: 'juniper' });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'cannot_show' });
    await h.act('b', 'show_card', { card: 'saber' });
    expect(h.last('a', 'event').event).toMatchObject({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '2', card: 'saber' });
    expect(h.last('b', 'event').event).toMatchObject({ kind: 'refuted', card: 'saber' });
    expect(h.last('c', 'event').event).toMatchObject({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '2' });
    expect(h.last('c', 'event').event).not.toHaveProperty('card');
    expect(h.snapshot('c').log.at(-1)).not.toHaveProperty('card');
    expect(h.snapshot('a').turn).toMatchObject({ phase: 'suggested' });
  });

  it('goes unrefuted when nobody holds a named card', async () => {
    await knownCase();
    walkedInto('parlor');
    await h.act('a', 'suggest', { suspect: 'thorne', weapon: 'bust' });
    expect(h.last('c', 'event').event).toMatchObject({ kind: 'suggested', passed: ['2', '3'], refuterSeatId: null });
    expect(h.snapshot('c').turn).toMatchObject({ phase: 'suggested', refuterSeatId: null });
  });
});

describe('the end of a case', () => {
  it('solves the case on a right accusation and opens the recap', async () => {
    await knownCase();
    await h.act('a', 'accuse', { suspect: 'thorne', weapon: 'bust', room: 'cellar' });
    expect(h.snapshot('a')).toMatchObject({ status: 'playing', currentSeatId: '2' });
    expect(h.snapshot('a').seats[0]!.eliminated).toBe(true);
    expect(h.snapshot('a').solution).toBeNull();
    h.openTurn();
    await h.act('b', 'accuse', { ...SOLUTION });
    expect(h.last('c', 'event').event).toMatchObject({ kind: 'game_over', winnerSeatId: '2', reason: 'solved', solution: SOLUTION });
    for (const conn of ['a', 'b', 'c']) {
      const snap = h.snapshot(conn);
      expect(snap).toMatchObject({ status: 'finished', winnerSeatId: '2', endReason: 'solved', solution: SOLUTION, nextActionAt: null });
      expect(snap.recap).toMatchObject({
        solution: SOLUTION,
        hands: HANDS,
        roster: { '1': { displayName: expect.any(String), suspect: 'vesper' }, '2': { suspect: 'finch' }, '3': { suspect: 'juniper' } },
        startedAt: expect.any(String),
        endedAt: expect.any(String),
      });
      expect(snap.recap!.events.map((e) => e.kind)).toEqual(['game_started', 'accused', 'turn_passed', 'accused', 'game_over']);
    }
  });

  it('plays a whole case of random legal moves to the end', async () => {
    await h.setupCase(['a', 'b', 'c', 'd']);
    await playOut(h, seededRandom(3));
    const snap = h.snapshot('d');
    expect(snap.status).toBe('finished');
    expect(snap.endReason).toBe('solved');
    expect(snap.recap!.events.length).toBeGreaterThan(20);
    expect(snap.recap!.events.some((e) => e.kind === 'suggested')).toBe(true);
  });

  it('opens the next case when the host asks, keeping suspects and seats', async () => {
    await knownCase();
    await h.act('b', 'new_game');
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'not_finished' });
    await h.act('a', 'accuse', { ...SOLUTION });
    await h.act('b', 'new_game');
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'not_host' });
    await h.act('a', 'new_game');
    const snap = h.snapshot('c');
    expect(snap).toMatchObject({ status: 'setup', gameNumber: 1, players: [], log: [], solution: null, winnerSeatId: null });
    expect(snap.recap).toBeUndefined();
    expect(snap.seats.slice(0, 3).map((s) => [s.suspect, s.ready])).toEqual([
      ['vesper', false],
      ['finch', false],
      ['juniper', false],
    ]);
    for (const conn of ['a', 'b', 'c']) await h.act(conn, 'ready');
    await h.act('a', 'start_game');
    expect(h.last('a', 'event').event.eventId).toBe('2-1');
  });
});

describe('leaving', () => {
  it('lays a departing detective’s cards face up and passes their turn', async () => {
    await h.setupCase(['a', 'b', 'c', 'd']);
    const hand = h.game().hands['1']!;
    await h.act('a', 'leave');
    expect(h.last('a', 'left')).toEqual({ type: 'left', seatId: '1' });
    expect(h.last('b', 'event').event).toMatchObject({ kind: 'turn_passed', seatId: '1', nextSeatId: '2' });
    const departed = h.events('b').find((m) => m.event.kind === 'departed')!.event;
    expect(departed).toMatchObject({ seatId: '1', reason: 'left', revealed: hand });
    const snap = h.snapshot('b');
    expect(snap).toMatchObject({ status: 'playing', currentSeatId: '2', revealedCards: hand });
    expect(snap.seats[0]!.occupied).toBe(false);
    expect(snap.players).toEqual(['1', '2', '3', '4']);
  });

  it('ends the case when only one detective is left', async () => {
    await h.setupCase(['a', 'b', 'c']);
    await h.act('b', 'leave');
    await h.act('c', 'leave');
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', endReason: 'abandoned', winnerSeatId: null });
    expect(h.snapshot('a').recap!.roster['3']).toMatchObject({ suspect: 'juniper' });
  });

  it('locks the table mid-case and opens it again once the case is over', async () => {
    await h.setupCase();
    await h.connect('late');
    await h.join('late');
    await h.send('late', { action: 'sit', accessToken: h.tokenFor('late') });
    expect(h.lastError('late')).toEqual({ type: 'error', code: 'table_locked' });
    await h.act('a', 'accuse', { ...h.game().solution! });
    await h.send('late', { action: 'sit', accessToken: h.tokenFor('late') });
    expect(h.last('late', 'sat').seatId).toBe('4');
    expect(h.snapshot('late').recap).toBeUndefined();
    expect(h.snapshot('late').you).toMatchObject({ seatId: '4', hand: [] });
  });

  it('tells everyone at the table when the host deletes it mid-case', async () => {
    await h.setupCase();
    await h.connect('host');
    await h.send('host', { action: 'delete_table', accessToken: h.tokenFor('inspector'), tableId: TABLE_ID });
    const notice: ServerMessage = { type: 'table_deleted', tableId: TABLE_ID };
    for (const conn of ['a', 'b', 'c']) expect(h.last(conn, 'table_deleted')).toEqual(notice);
    await h.act('a', 'roll');
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'table_not_found' });
  });
});

describe('ping', () => {
  it('answers with the server time', async () => {
    await h.connect('c');
    await h.send('c', { action: 'ping' });
    expect(h.lastError('c')).toEqual({ type: 'pong', serverTs: h.now });
  });
});
