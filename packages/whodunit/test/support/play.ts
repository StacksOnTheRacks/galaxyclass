import { occupiedHalls, reachable } from '../../src/rules/board.js';
import { matchingCards } from '../../src/rules/cards.js';
import { SUSPECT_IDS, WEAPON_IDS } from '../../src/rules/constants.js';
import { canSuggest, suspectOf } from '../../src/rules/game.js';
import type { Random } from '../../src/rules/random.js';
import type { Harness } from './runtime-harness.js';

const pick = <T>(items: readonly T[], random: Random): T => items[random.int(items.length)]!;

/**
 * Plays one legal action for whoever is due to act, chosen with `random`: the refuter shows a card,
 * otherwise the detective whose turn it is suggests when they can, rolls, walks (into a room when
 * one is in reach), or ends the turn. From `accuseFrom` turns on, they accuse: wrongly on odd turns,
 * correctly on even ones, so a case always ends.
 */
export async function playStep(h: Harness, random: Random, accuseFrom = 14): Promise<void> {
  h.openTurn();
  const game = h.game();
  const turn = game.turn!;
  if (turn.phase === 'refuting') {
    const refuter = turn.refuterSeatId!;
    const card = pick(matchingCards(game.hands[refuter] ?? [], turn.suggestion!), random);
    await h.act(h.connOf(refuter), 'show_card', { card });
    return;
  }
  const seatId = game.currentSeatId!;
  const conn = h.connOf(seatId);
  if (game.turnNumber >= accuseFrom) {
    const accusation = game.turnNumber % 2 ? { ...game.solution!, weapon: WEAPON_IDS.find((w) => w !== game.solution!.weapon)! } : game.solution!;
    await h.act(conn, 'accuse', { ...accusation });
    return;
  }
  if (canSuggest(game, seatId)) {
    await h.act(conn, 'suggest', { suspect: pick(SUSPECT_IDS, random), weapon: pick(WEAPON_IDS, random) });
    return;
  }
  if (turn.phase === 'start') {
    await h.act(conn, 'roll');
    return;
  }
  if (turn.phase === 'moving') {
    const suspect = suspectOf(game, seatId)!;
    const reach = reachable(game.positions[suspect], turn.dice![0] + turn.dice![1], occupiedHalls(game.positions, suspect), {
      excludeRoom: turn.startRoom,
    });
    const rooms = reach.filter((r) => r.destination.kind === 'room');
    if (reach.length) {
      await h.act(conn, 'move', { to: pick(rooms.length ? rooms : reach, random).destination });
      return;
    }
  }
  await h.act(conn, 'end_turn');
}


/** Plays until the case ends (or `maxSteps` actions, which fails the caller's expectations). */
export async function playOut(h: Harness, random: Random, accuseFrom?: number, maxSteps = 400): Promise<void> {
  for (let step = 0; step < maxSteps && h.game().status === 'playing'; step++) {
    await playStep(h, random, accuseFrom);
  }
}
