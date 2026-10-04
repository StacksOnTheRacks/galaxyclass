import { describe, expect, it } from 'vitest';
import {
  draftPlacements,
  draftTileAt,
  EMPTY_DRAFT,
  moveInRack,
  pickUp,
  placeTile,
  rackView,
  recallAll,
  setBlankLetter,
  shuffleRack,
  syncDraft,
} from '../../src/client/draft.js';
import { seededRandom } from '../../src/rules/bag.js';
import type { Tile } from '../../src/rules/types.js';

const rack: Tile[] = [
  { id: 'c', letter: 'C' },
  { id: 'a', letter: 'A' },
  { id: 't', letter: 'T' },
  { id: 'b', letter: null },
];
const empty = () => false;
const start = syncDraft(EMPTY_DRAFT, rack, empty);

describe('play draft', () => {
  it('snaps a tile to a square and lifts it back to the rack before commit', () => {
    const placed = placeTile(start, 'c', 7, 7, empty)!;
    expect(draftTileAt(placed, 7, 7)).toBe('c');
    expect(rackView(placed, rack).map((t) => t.id)).toEqual(['a', 't', 'b']);
    const lifted = pickUp(placed, 'c');
    expect(draftTileAt(lifted, 7, 7)).toBeNull();
    expect(rackView(lifted, rack).map((t) => t.id)).toEqual(['c', 'a', 't', 'b']);
  });

  it('refuses a square that holds a committed tile or another draft tile', () => {
    const occupied = (row: number, col: number) => row === 7 && col === 7;
    expect(placeTile(start, 'c', 7, 7, occupied)).toBeNull();
    const one = placeTile(start, 'c', 7, 8, empty)!;
    expect(placeTile(one, 'a', 7, 8, empty)).toBeNull();
    expect(placeTile(one, 'c', 7, 9, empty)!.placed.c).toEqual({ row: 7, col: 9, letter: null });
  });

  it('sends only tile ids and squares, plus the chosen letter for a blank', () => {
    let draft = placeTile(start, 'c', 7, 6, empty)!;
    draft = placeTile(draft, 'b', 7, 7, empty)!;
    expect(draftPlacements(draft, rack)).toEqual({ ok: false, blankTileId: 'b' });
    draft = setBlankLetter(draft, 'b', 'O');
    expect(draftPlacements(draft, rack)).toEqual({
      ok: true,
      placements: [
        { tileId: 'c', row: 7, col: 6 },
        { tileId: 'b', row: 7, col: 7, letter: 'O' },
      ],
    });
  });

  it('lets a blank change letter until Play and forgets it when picked up', () => {
    let draft = setBlankLetter(placeTile(start, 'b', 7, 7, empty)!, 'b', 'O');
    draft = setBlankLetter(draft, 'b', 'E');
    expect(draft.placed.b!.letter).toBe('E');
    expect(setBlankLetter(draft, 'b', 'é').placed.b!.letter).toBe('E');
    const again = placeTile(pickUp(draft, 'b'), 'b', 7, 7, empty)!;
    expect(again.placed.b!.letter).toBeNull();
  });

  it('drops played tiles and newly covered squares when a snapshot arrives', () => {
    let draft = placeTile(start, 'c', 7, 7, empty)!;
    draft = placeTile(draft, 'a', 3, 3, empty)!;
    const after = syncDraft(draft, [rack[1]!, rack[2]!, { id: 'n', letter: 'N' }], (row, col) => row === 3 && col === 3);
    expect(after.placed).toEqual({});
    expect(after.order).toEqual(['a', 't', 'n']);
  });

  it('reorders, shuffles, and recalls without losing tiles', () => {
    const moved = moveInRack(start, 'b', 0);
    expect(rackView(moved, rack).map((t) => t.id)).toEqual(['b', 'c', 'a', 't']);
    const shuffled = shuffleRack(moved, seededRandom(3));
    expect([...shuffled.order].sort()).toEqual(['a', 'b', 'c', 't']);
    const recalled = recallAll(placeTile(start, 't', 1, 1, empty)!);
    expect(recalled.placed).toEqual({});
  });
});
