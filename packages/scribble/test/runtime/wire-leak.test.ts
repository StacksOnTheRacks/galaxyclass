import { afterEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../support/cognito-tokens.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

afterEach(() => vi.restoreAllMocks());

/**
 * Plays several turns with real random racks and inspects every frame each connection received,
 * byte for byte, for anything it must not see.
 */
describe('hidden state on the wire', () => {
  it('never sends one seat’s rack, the bag, tokens, or account subs to another connection', async () => {
    const h = new Harness();
    await h.seed();
    const tokenA = await h.seat('a', { accessToken: signAccessToken() });
    const tokenB = await h.seat('b');
    await h.connect('spectator');
    await h.join('spectator');
    await h.send('a', { action: 'start_game', seatToken: tokenA });

    const secrets = { a: new Set<string>(), b: new Set<string>(), bag: new Set<string>() };
    const record = () => {
      for (const id of h.rackIds('1')) secrets.a.add(id);
      for (const id of h.rackIds('2')) secrets.b.add(id);
      for (const tile of h.store.tables.get(TABLE_ID)!.game.bag) secrets.bag.add(tile.id);
    };
    record();

    for (let turn = 0; turn < 4; turn++) {
      const current = h.store.tables.get(TABLE_ID)!.game.currentSeatId;
      const [conn, token] = current === '1' ? ['a', tokenA] : ['b', tokenB];
      await h.send(conn, { action: 'exchange', seatToken: token, tileIds: (current === '1' ? h.rackIds('1') : h.rackIds('2')).slice(0, 3) });
      record();
    }

    // Tiles that later left a rack for the bag were legitimately seen by their owner earlier; the bag set
    // only has to stay hidden from everyone at the moment it is in the bag, so check the final bag.
    const finalBag = new Set(h.store.tables.get(TABLE_ID)!.game.bag.map((t) => t.id));
    const finalA = new Set(h.rackIds('1'));
    const finalB = new Set(h.rackIds('2'));

    const wire = (conn: string) => (h.wire.get(conn) ?? []).join('\n');
    const leaks = (conn: string, ids: Iterable<string>) => [...ids].filter((id) => wire(conn).includes(`"${id}"`));

    expect(leaks('b', [...finalA].filter((id) => !secrets.b.has(id)))).toEqual([]);
    expect(leaks('a', [...finalB].filter((id) => !secrets.a.has(id)))).toEqual([]);
    expect(leaks('spectator', [...finalA, ...finalB])).toEqual([]);
    for (const conn of ['a', 'b', 'spectator']) {
      expect(leaks(conn, [...finalBag].filter((id) => !secrets.a.has(id) && !secrets.b.has(id)))).toEqual([]);
      expect(wire(conn)).not.toMatch(/"bag"\s*:/);
      expect(wire(conn)).not.toMatch(/seatTokenHash|playerSub|sub-word-smith|connectionId/);
    }
    expect(wire('b')).not.toContain(tokenA);
    expect(wire('a')).not.toContain(tokenB);
    expect(wire('spectator')).not.toContain(tokenA);

    const forB = h.snapshot('b');
    expect(forB.seats[0]).toMatchObject({ rackCount: 7, displayName: 'WordSmith', avatarId: 12 });
    expect(Object.keys(forB.seats[0]!)).not.toContain('rack');
    expect(forB.you!.seatId).toBe('2');
    expect(h.snapshot('spectator').you).toBeNull();
  });

  it('keeps tile ids off the board in snapshots', async () => {
    const h = new Harness();
    await h.seed();
    const tokenA = await h.seat('a');
    await h.seat('b');
    await h.send('a', { action: 'start_game', seatToken: tokenA });
    h.rigRack('1', 'CATDOGS');
    h.rigRack('2', 'EEEEEEE');
    h.rigGame((table) => {
      table.game.currentSeatId = '1';
    });
    const placements = ['C', 'A', 'T'].map((letter, i) => ({ tileId: h.tileId('1', letter), row: 7, col: 6 + i }));
    await h.send('a', { action: 'play', seatToken: tokenA, placements });
    expect(Object.keys(h.snapshot('b').board[0]!).sort()).toEqual(['blank', 'col', 'letter', 'row']);
    for (const p of placements) {
      expect((h.wire.get('b') ?? []).join('')).not.toContain(p.tileId);
    }
  });
});
