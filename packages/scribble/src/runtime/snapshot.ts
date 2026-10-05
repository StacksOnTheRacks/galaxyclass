import type { ConnectionRecord, PublicSeat, SeatRecord, TableRecord, TableSnapshot } from './types.js';

/**
 * Builds the view one connection is allowed to see. Only the viewer's own seat carries a rack;
 * everyone else gets a count. The bag, other racks, tile ids on the board, account subs, and
 * seat tokens are never included.
 */
export function buildSeatScopedSnapshot(
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  viewer: ConnectionRecord | null,
): TableSnapshot {
  const game = table.game;
  const inGame = new Set(game.turnOrder);
  const viewerSeat =
    viewer?.seatId && viewer.tableId === table.tableId
      ? seats.find((seat) => seat.seatId === viewer.seatId && seat.connectionId === viewer.connectionId)
      : undefined;

  const publicSeats: PublicSeat[] = [];
  for (let n = 1; n <= table.maxSeats; n++) {
    const seatId = String(n);
    const seat = seats.find((s) => s.seatId === seatId);
    publicSeats.push(
      seat
        ? {
            seatId,
            occupied: true,
            displayName: seat.displayName,
            avatarId: seat.avatarId,
            signedIn: Boolean(seat.playerSub),
            score: seat.score,
            rackCount: seat.rack.length,
            inGame: inGame.has(seatId),
            isLocal: seat === viewerSeat,
            connected: Boolean(seat.connectionId),
            awaySince: seat.connectionId ? null : (seat.awaySince ?? null),
          }
        : {
            seatId,
            occupied: false,
            displayName: null,
            avatarId: null,
            signedIn: false,
            score: 0,
            rackCount: 0,
            inGame: false,
            isLocal: false,
            connected: false,
            awaySince: null,
          },
    );
  }

  return {
    type: 'table_snapshot',
    tableId: table.tableId,
    version: table.version,
    tableName: table.tableName ?? null,
    themeId: table.themeId,
    maxSeats: table.maxSeats,
    gameNumber: table.gameNumber,
    status: game.status,
    seats: publicSeats,
    board: game.board.map(({ row, col, letter, blank }) => ({ row, col, letter, blank })),
    bagCount: game.bag.length,
    currentSeatId: game.currentSeatId,
    turnNumber: game.turnNumber,
    scorelessTurns: game.scorelessTurns,
    lastTurn: game.lastTurn,
    endReason: game.endReason,
    finalAdjustments: game.finalAdjustments,
    wentOutSeatId: game.wentOutSeatId,
    you: viewerSeat
      ? { seatId: viewerSeat.seatId, rack: viewerSeat.rack.map(({ id, letter }) => ({ id, letter })) }
      : null,
  };
}
