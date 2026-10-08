import type { GameEvent, PublicSeat, PublicTurn, TableSnapshot, YouView } from '../protocol.js';
import { startPositions } from '../rules/board.js';
import { matchingCards } from '../rules/cards.js';
import { SEAT_IDS } from '../rules/constants.js';
import type { SeatId } from '../rules/types.js';
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

/** The table's creator when seated, otherwise the lowest occupied seat. Starts each case. */
export function hostSeatOf(table: TableRecord, seats: ReadonlyArray<SeatRecord>): SeatId | null {
  const creator = table.createdBy ? seats.find((seat) => seat.playerSub === table.createdBy) : undefined;
  return creator?.seatId ?? seats[0]?.seatId ?? null;
}

/** The shown card is for the suggester and the refuter only; everyone else learns that a card was shown. */
export function redactEvent(event: GameEvent, viewer: SeatId | null): GameEvent {
  if (event.kind !== 'refuted' || viewer === event.suggesterSeatId || viewer === event.refuterSeatId) {
    return event;
  }
  const { card: _hidden, ...rest } = event;
  return rest;
}

/**
 * Builds the view one connection is allowed to see. A detective in the case gets the board, the
 * public log (with only the cards shown to or by them), and their own hand; never the case file
 * before it is solved or another detective's hand. Account subs, seat tokens, and connection ids are
 * never included. A connection without a seat in the case sees who is seated and whose turn it is,
 * and no board at all.
 */
export function buildSeatScopedSnapshot(
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  viewer: ConnectionRecord | null,
  now: number,
): TableSnapshot {
  const game = table.game;
  const viewerSeat = viewerSeatOf(table, seats, viewer);
  const me = viewerSeat?.seatId ?? null;
  const inCase = me !== null && game.status !== 'setup' && game.players.includes(me);
  const hostSeatId = hostSeatOf(table, seats);

  const publicSeats: PublicSeat[] = SEAT_IDS.map((seatId) => {
    const seat = seats.find((s) => s.seatId === seatId);
    if (!seat) {
      return {
        seatId,
        occupied: false,
        displayName: null,
        avatarId: null,
        isLocal: false,
        connected: false,
        awaySince: null,
        suspect: null,
        ready: false,
        isHost: false,
        eliminated: false,
        handSize: null,
      };
    }
    const playing = game.status !== 'setup' && game.players.includes(seatId);
    const pick = game.picks[seatId];
    return {
      seatId,
      occupied: true,
      displayName: seat.displayName,
      avatarId: seat.avatarId,
      isLocal: seat === viewerSeat,
      connected: Boolean(seat.connectionId),
      awaySince: seat.connectionId ? null : (seat.awaySince ?? null),
      suspect: pick?.suspect ?? null,
      ready: game.status === 'setup' && (pick?.ready ?? false),
      isHost: seatId === hostSeatId,
      eliminated: playing && game.eliminated.includes(seatId),
      handSize: playing ? (game.hands[seatId]?.length ?? 0) : null,
    };
  });

  let turn: PublicTurn | null = null;
  if (inCase && game.turn) {
    const { phase, dice, enteredRoom, suggestion, refuterSeatId, passed } = game.turn;
    turn = { phase, dice, enteredRoom, suggestion, refuterSeatId, passed: [...passed] };
  }

  let you: YouView | null = null;
  if (me) {
    const hand = inCase ? [...(game.hands[me] ?? [])] : [];
    const refuting = inCase && game.turn?.phase === 'refuting' && game.turn.refuterSeatId === me && game.turn.suggestion;
    you = {
      seatId: me,
      suspect: game.picks[me]?.suspect ?? null,
      hand,
      refute:
        refuting && game.turn?.suggestion && game.currentSeatId
          ? {
              suggesterSeatId: game.currentSeatId,
              suggestion: { ...game.turn.suggestion },
              matching: matchingCards(hand, game.turn.suggestion),
            }
          : null,
      pulledIn: inCase && game.status === 'playing' && game.pulledIn.includes(me),
    };
  }

  const finished = game.status === 'finished';
  return {
    type: 'table_snapshot',
    tableId: table.tableId,
    version: table.version,
    tableName: table.tableName ?? null,
    gameNumber: table.gameNumber,
    status: game.status,
    seats: publicSeats,
    hostSeatId,
    players: [...game.players],
    currentSeatId: game.currentSeatId,
    turnNumber: game.turnNumber,
    turn,
    nextActionAt: game.status === 'playing' ? game.nextActionAt : null,
    serverTs: now,
    positions: inCase ? { ...game.positions } : me && game.status === 'setup' ? startPositions() : null,
    weapons: inCase && game.weapons ? { ...game.weapons } : null,
    pulledIn: inCase && game.status === 'playing' ? [...game.pulledIn] : [],
    revealedCards: inCase ? [...game.revealedCards] : [],
    log: inCase ? game.log.map((event) => redactEvent(event, me)) : [],
    winnerSeatId: game.winnerSeatId,
    endReason: game.endReason,
    solution: inCase && finished && game.solution ? { ...game.solution } : null,
    you,
    ...(inCase && finished ? { recap: recapOf(game, me) } : {}),
  };
}
