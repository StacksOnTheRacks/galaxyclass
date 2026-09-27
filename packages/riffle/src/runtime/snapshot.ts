import {
  bigBlindSeatId,
  minOpeningWager,
  minRaiseTo,
  smallBlindSeatId,
  toCall,
} from '../rules/state.js';
import { isSeatAway, rehydrateHandState } from './hand-state.js';
import type {
  ConnectionRecord,
  PlayerSnapshotSeat,
  SeatRecord,
  SnapshotPot,
  TableRecord,
  TableSnapshotMessage,
} from './types.js';

export function formatBlindsLabel(blinds: { smallBlind: number; bigBlind: number }): string {
  return `$${blinds.smallBlind} / $${blinds.bigBlind}`;
}

function seatPosition(
  seatId: string,
  buttonSeatId: string,
  handState: NonNullable<ReturnType<typeof rehydrateHandState>>,
): PlayerSnapshotSeat['position'] {
  if (seatId === buttonSeatId) {
    return 'D';
  }
  // After a completed hand the button player may have left; blinds are then unknowable.
  if (!handState.seats.some((seat) => seat.seatId === buttonSeatId)) {
    return null;
  }
  if (seatId === smallBlindSeatId(handState)) {
    return 'SB';
  }
  if (seatId === bigBlindSeatId(handState)) {
    return 'BB';
  }
  return null;
}

function snapshotPots(table: TableRecord, handState: NonNullable<ReturnType<typeof rehydrateHandState>>): SnapshotPot[] | undefined {
  const source = handState.pots ?? table.pots;
  if (!source || source.length === 0) {
    return undefined;
  }
  if (source.length === 1) {
    return undefined;
  }
  return source.map((pot) => ({
    label: pot.label,
    amount: pot.amount,
  }));
}

function winnerAmountForSeat(
  table: TableRecord,
  handState: NonNullable<ReturnType<typeof rehydrateHandState>>,
  seatId: string,
): number | undefined {
  const winners = handState.winners ?? table.winners;
  const winner = winners?.find((row) => row.seatId === seatId);
  return winner?.amount;
}

function shouldRevealHoleCards(
  table: TableRecord,
  handState: NonNullable<ReturnType<typeof rehydrateHandState>>,
  seat: SeatRecord,
): boolean {
  if (handState.completeReason !== 'showdown' || handState.phase !== 'complete') {
    return false;
  }
  return !seat.folded && Boolean(seat.hole);
}

export function buildSeatScopedSnapshot(
  table: TableRecord,
  seats: SeatRecord[],
  viewer: ConnectionRecord | null,
): TableSnapshotMessage {
  const occupied = seats.filter((seat) => seat.displayName);
  const handState = rehydrateHandState(table, occupied);
  const viewerSeatId = viewer?.seatId ?? null;
  const isComplete = handState?.phase === 'complete';

  const playerSeats: PlayerSnapshotSeat[] = occupied.map((seat) => {
    const handSeat = handState?.seats.find((row) => row.seatId === seat.seatId);
    const snapshotSeat: PlayerSnapshotSeat = {
      seatId: seat.seatId,
      displayName: seat.displayName,
      isLocal: seat.seatId === viewerSeatId,
      stack: seat.stack,
      inHand: table.status === 'hand_in_progress' && Boolean(seat.hole) && !seat.folded,
      committed: seat.streetCommitted ?? 0,
      position:
        handState && table.buttonSeatId
          ? seatPosition(seat.seatId, table.buttonSeatId, handState)
          : null,
      acting: !isComplete && table.currentSeatId === seat.seatId,
      folded: seat.folded ?? false,
      allIn: seat.allIn ?? handSeat?.allIn ?? false,
    };

    if (isSeatAway(seat)) {
      snapshotSeat.away = true;
    }

    if (handState && isComplete) {
      const wonAmount = winnerAmountForSeat(table, handState, seat.seatId);
      if (wonAmount !== undefined && wonAmount > 0) {
        snapshotSeat.wonAmount = wonAmount;
      }
    }

    if (handState && shouldRevealHoleCards(table, handState, seat)) {
      snapshotSeat.holeCards = [seat.hole![0], seat.hole![1]];
    }

    return snapshotSeat;
  });

  const snapshot: TableSnapshotMessage = {
    type: 'table_snapshot',
    tableId: table.tableId,
    version: table.version,
    status: table.status,
    createdAt: table.createdAt,
    handNumber: table.handNumber > 0 ? table.handNumber : null,
    street: table.status === 'hand_in_progress' ? (table.street ?? 'preflop') : null,
    blindsLabel: formatBlindsLabel(table.blinds),
    seatedPlayersLabel: `${occupied.length} / ${table.maxSeats}`,
    pot: table.pot ?? 0,
    buttonSeatId: table.buttonSeatId ?? null,
    currentSeatId: isComplete ? null : (table.currentSeatId ?? null),
    seats: playerSeats,
  };

  if (table.status === 'hand_in_progress') {
    snapshot.phase = table.phase ?? 'betting';
    snapshot.board = [...(table.board ?? [])];
    snapshot.completeReason = handState?.completeReason ?? table.completeReason ?? null;

    if (handState) {
      const pots = snapshotPots(table, handState);
      if (pots) {
        snapshot.pots = pots;
      }
    }
  }

  if (viewerSeatId && handState) {
    const localSeat = occupied.find((seat) => seat.seatId === viewerSeatId);
    if (localSeat?.hole) {
      snapshot.pocketCards = [localSeat.hole[0], localSeat.hole[1]];
      const handSeat = handState.seats.find((seat) => seat.seatId === viewerSeatId);
      if (handSeat && handState.phase === 'betting') {
        snapshot.toCall = toCall(handSeat, handState.currentBet);
        snapshot.currentBet = handState.currentBet;
        snapshot.minRaiseTo =
          handState.currentBet === 0 ? minOpeningWager(handState) : minRaiseTo(handState);
      }
    }
  }

  return snapshot;
}

export function buildPublicSnapshot(table: TableRecord): TableSnapshotMessage {
  return buildSeatScopedSnapshot(table, [], null);
}
