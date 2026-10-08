import type { OwnBoardView, PublicSeat, TableSnapshot, TargetBoardView } from '../protocol.js';
import { SEAT_IDS } from '../rules/constants.js';
import { shipsAfloat } from '../rules/fleet.js';
import { incomingMarks, toMark } from '../rules/game.js';
import type { SeatId, SunkShip } from '../rules/types.js';
import { recapOf } from './recap.js';
import type { ConnectionRecord, SeatRecord, TableRecord } from './types.js';

/** The seat this connection is actually sitting in: a copied seat id on a stale connection does not count. */
export function viewerSeatOf(
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  viewer: ConnectionRecord | null,
): SeatRecord | undefined {
  return viewer?.seatId && viewer.tableId === table.tableId
    ? seats.find((seat) => seat.seatId === viewer.seatId && seat.connectionId === viewer.connectionId)
    : undefined;
}

function otherSeat(seatId: SeatId): SeatId {
  return seatId === SEAT_IDS[0] ? SEAT_IDS[1] : SEAT_IDS[0];
}

/**
 * Builds the view one connection is allowed to see. The viewer gets their own fleet and the shots
 * fired at it; of the opponent's fleet they get only their own shots and the ships those shots sank,
 * until the game is finished. Account subs, seat tokens, and connection ids are never included.
 * A connection without a seat sees who is seated and the game's progress, and no board at all.
 */
export function buildSeatScopedSnapshot(
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  viewer: ConnectionRecord | null,
  now: number,
): TableSnapshot {
  const game = table.game;
  const scored = game.status === 'battle' || game.status === 'finished';
  const viewerSeat = viewerSeatOf(table, seats, viewer);

  const publicSeats: PublicSeat[] = SEAT_IDS.map((seatId) => {
    const seat = seats.find((s) => s.seatId === seatId);
    const board = game.boards[seatId];
    if (!seat) {
      return {
        seatId,
        occupied: false,
        displayName: null,
        avatarId: null,
        isLocal: false,
        connected: false,
        awaySince: null,
        ready: false,
        shipsAfloat: null,
      };
    }
    return {
      seatId,
      occupied: true,
      displayName: seat.displayName,
      avatarId: seat.avatarId,
      isLocal: seat === viewerSeat,
      connected: Boolean(seat.connectionId),
      awaySince: seat.connectionId ? null : (seat.awaySince ?? null),
      ready: board?.ready ?? false,
      shipsAfloat: scored && board?.fleet ? shipsAfloat(board.fleet, incomingMarks(game, seatId)) : null,
    };
  });

  let you: OwnBoardView | null = null;
  let target: TargetBoardView | null = null;
  if (viewerSeat) {
    const me = viewerSeat.seatId;
    const opp = otherSeat(me);
    const mine = game.boards[me];
    you = { seatId: me, fleet: mine?.fleet ?? null, ready: mine?.ready ?? false, incoming: incomingMarks(game, me) };
    if (seats.some((seat) => seat.seatId === opp) || game.players.includes(opp)) {
      const fired = game.history.filter((shot) => shot.shooter === me);
      target = {
        seatId: opp,
        shots: fired.map(toMark),
        sunk: fired.flatMap((shot): SunkShip[] => (shot.sunkShip ? [shot.sunkShip] : [])),
        revealed: game.status === 'finished' ? (game.boards[opp]?.fleet ?? null) : null,
      };
    }
  }

  return {
    type: 'table_snapshot',
    tableId: table.tableId,
    version: table.version,
    tableName: table.tableName ?? null,
    gameNumber: table.gameNumber,
    status: game.status,
    seats: publicSeats,
    currentSeatId: game.currentSeatId,
    turnNumber: game.turnNumber,
    turnOpensAt: game.turnOpensAt,
    serverTs: now,
    lastShot: viewerSeat ? (game.history.at(-1) ?? null) : null,
    winnerSeatId: game.winnerSeatId,
    endReason: game.endReason,
    rematchVotes: [...game.rematchVotes],
    you,
    target,
    ...(viewerSeat && game.status === 'finished' ? { recap: recapOf(game) } : {}),
  };
}
