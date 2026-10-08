import type { PublicSeat, TableSnapshot } from '../protocol.js';
import { AWAY_ABANDON_AFTER_MS, BOARD_SIZE, FLEET, SHIP_NAME } from '../rules/constants.js';
import { shipCells, sunkShips } from '../rules/fleet.js';
import type { Coord, Fleet, ShipId, ShipPlacement, ShotMark, ShotResult } from '../rules/types.js';
import { cellName } from './draft.js';

export type Screen = 'connecting' | 'notice' | 'waiting' | 'placing' | 'battle' | 'finished';

export interface ShipView {
  placement: ShipPlacement;
  sunk: boolean;
  /** Shown only because the game is over. */
  revealed: boolean;
}

export interface CellView {
  row: number;
  col: number;
  mark: ShotResult | null;
  /** The ship drawn on this cell: own ships on your board; sunk or revealed ships on theirs. */
  ship: ShipId | null;
  sunk: boolean;
  label: string;
}

export interface BoardModel {
  mode: 'own' | 'target';
  ships: ShipView[];
  cells: CellView[][];
  shots: number;
  hits: number;
}

export interface TrackerChip {
  shipId: ShipId;
  name: string;
  length: number;
  sunk: boolean;
}

export type Tone = 'mine' | 'theirs' | 'neutral' | 'win' | 'lose';

export interface ViewModel {
  screen: Screen;
  notice: { title: string; body: string } | null;
  me: PublicSeat | null;
  opponent: PublicSeat | null;
  myTurn: boolean;
  /** It is my turn and the server will accept a shot now. */
  canFire: boolean;
  fireBlockedReason: string | null;
  status: string;
  tone: Tone;
  own: BoardModel;
  target: BoardModel;
  ownTracker: TrackerChip[];
  targetTracker: TrackerChip[];
  ready: boolean;
  opponentReady: boolean;
  /** Edit fleet: allowed until the other captain is ready too. */
  canUnready: boolean;
  won: boolean | null;
  endReason: TableSnapshot['endReason'];
  rematchVoted: boolean;
  opponentRematchVoted: boolean;
  canRematch: boolean;
  canClaimAbandoned: boolean;
  canForfeit: boolean;
}

export interface ViewContext {
  /** Server epoch ms. */
  serverNow: number;
  /** A shot animation is still playing. */
  resolving: boolean;
  /** The table connection is down. */
  offline?: boolean;
}

const key = (coord: Coord) => coord.row * BOARD_SIZE + coord.col;

function shipCellMap(ships: ShipView[]): Map<number, ShipView> {
  const map = new Map<number, ShipView>();
  for (const ship of ships) {
    for (const cell of shipCells(ship.placement)) {
      map.set(key(cell), ship);
    }
  }
  return map;
}

function markMap(marks: ShotMark[]): Map<number, ShotMark> {
  const map = new Map<number, ShotMark>();
  for (const mark of marks) {
    if (!map.has(key(mark))) {
      map.set(key(mark), mark);
    }
  }
  return map;
}

function cellLabel(mode: 'own' | 'target', coord: Coord, mark: ShotMark | undefined, ship: ShipView | undefined): string {
  const name = cellName(coord);
  if (mode === 'target') {
    if (!mark) {
      return ship?.revealed ? `${name}, unexplored, ${SHIP_NAME[ship.placement.shipId]}` : `${name}, unexplored`;
    }
    if (mark.result === 'miss') {
      return `${name}, miss`;
    }
    return ship?.sunk ? `${name}, hit, ${SHIP_NAME[ship.placement.shipId]} sunk` : `${name}, hit`;
  }
  const parts = [name, ship ? SHIP_NAME[ship.placement.shipId] : 'open water'];
  if (mark) {
    parts.push(mark.result === 'hit' ? (ship?.sunk ? 'hit, sunk' : 'hit') : 'miss');
  }
  return parts.join(', ');
}

function board(mode: 'own' | 'target', ships: ShipView[], marks: ShotMark[]): BoardModel {
  const byCell = shipCellMap(ships);
  const byMark = markMap(marks);
  const cells: CellView[][] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const line: CellView[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      const coord = { row, col };
      const mark = byMark.get(key(coord));
      const ship = byCell.get(key(coord));
      line.push({
        row,
        col,
        mark: mark?.result ?? null,
        ship: ship?.placement.shipId ?? null,
        sunk: Boolean(ship?.sunk),
        label: cellLabel(mode, coord, mark, ship),
      });
    }
    cells.push(line);
  }
  return {
    mode,
    ships,
    cells,
    shots: byMark.size,
    hits: [...byMark.values()].filter((mark) => mark.result === 'hit').length,
  };
}

/** Your own ocean: your fleet (or the draft while placing) and every shot fired at it. */
export function ownBoard(fleet: Fleet | null, incoming: ShotMark[]): BoardModel {
  const sunk = new Set(fleet ? sunkShips(fleet, incoming).map((ship) => ship.shipId) : []);
  const ships = (fleet ?? []).map((placement) => ({ placement, sunk: sunk.has(placement.shipId), revealed: false }));
  return board('own', ships, incoming);
}

/**
 * Their ocean as you may see it. Ships come only from `sunk` (public once sunk) and, after the
 * game, `revealed`. Marks never name a ship, so an unsunk hit stays anonymous.
 */
export function targetBoard(view: TableSnapshot['target']): BoardModel {
  if (!view) {
    return board('target', [], []);
  }
  const sunkIds = new Set(view.sunk.map((ship) => ship.shipId));
  const ships: ShipView[] = view.sunk.map((ship) => ({
    placement: { shipId: ship.shipId, row: ship.row, col: ship.col, orientation: ship.orientation },
    sunk: true,
    revealed: false,
  }));
  for (const placement of view.revealed ?? []) {
    if (!sunkIds.has(placement.shipId)) {
      ships.push({ placement, sunk: false, revealed: true });
    }
  }
  return board('target', ships, view.shots);
}

function tracker(sunk: Set<ShipId>): TrackerChip[] {
  return FLEET.map((ship) => ({ shipId: ship.id, name: ship.name, length: ship.length, sunk: sunk.has(ship.id) }));
}

function nameOf(seat: PublicSeat | null): string {
  return seat?.displayName ?? 'Your opponent';
}

function awayLongEnough(seat: PublicSeat | null, serverNow: number): boolean {
  if (!seat || !seat.occupied || seat.connected) {
    return false;
  }
  const since = seat.awaySince ? Date.parse(seat.awaySince) : Number.NaN;
  return Number.isFinite(since) && serverNow - since >= AWAY_ABANDON_AFTER_MS;
}

const END_COPY: Record<NonNullable<TableSnapshot['endReason']>, { win: string; lose: string }> = {
  fleet_sunk: { win: 'Their whole fleet is on the bottom.', lose: 'Your whole fleet was sunk.' },
  forfeit: { win: 'Your opponent struck their colours.', lose: 'You conceded the battle.' },
  abandoned: { win: 'Your opponent abandoned the battle.', lose: 'The battle was declared abandoned.' },
};

export function endLine(won: boolean, reason: TableSnapshot['endReason']): string {
  const copy = reason ? END_COPY[reason] : null;
  return copy ? (won ? copy.win : copy.lose) : won ? 'You won.' : 'You lost.';
}

export function viewModel(snapshot: TableSnapshot | null, draftFleet: Fleet | null, context: ViewContext): ViewModel {
  const empty = board('own', [], []);
  const base: ViewModel = {
    screen: 'connecting',
    notice: null,
    me: null,
    opponent: null,
    myTurn: false,
    canFire: false,
    fireBlockedReason: null,
    status: context.offline ? 'Reconnecting…' : 'Joining the table…',
    tone: 'neutral',
    own: empty,
    target: board('target', [], []),
    ownTracker: tracker(new Set()),
    targetTracker: tracker(new Set()),
    ready: false,
    opponentReady: false,
    canUnready: false,
    won: null,
    endReason: null,
    rematchVoted: false,
    opponentRematchVoted: false,
    canRematch: false,
    canClaimAbandoned: false,
    canForfeit: false,
  };
  if (!snapshot) {
    return base;
  }

  const me = snapshot.seats.find((seat) => seat.isLocal && seat.occupied) ?? null;
  if (!snapshot.you || !me) {
    const full = snapshot.seats.every((seat) => seat.occupied);
    if (snapshot.status === 'placing' || snapshot.status === 'battle') {
      return {
        ...base,
        screen: 'notice',
        notice: { title: 'Game in progress — seats are locked', body: 'Two captains are already at sea here. Check back when this battle ends.' },
        status: 'Seats are locked',
      };
    }
    if (full) {
      return {
        ...base,
        screen: 'notice',
        notice: { title: 'This table is full', body: 'Both seats are taken. Ask the host for another table, or start your own.' },
        status: 'Table full',
      };
    }
    return base;
  }

  const opponent = snapshot.seats.find((seat) => seat.seatId !== me.seatId && seat.occupied) ?? null;
  const them = nameOf(opponent);
  const status = snapshot.status;
  const ownFleet = status === 'placing' && !snapshot.you.ready ? draftFleet : (snapshot.you.fleet ?? draftFleet);
  const own = ownBoard(ownFleet, snapshot.you.incoming);
  const target = targetBoard(snapshot.target);
  const ownSunk = new Set(own.ships.filter((ship) => ship.sunk).map((ship) => ship.placement.shipId));
  const targetSunk = new Set((snapshot.target?.sunk ?? []).map((ship) => ship.shipId));
  const vm: ViewModel = {
    ...base,
    me,
    opponent,
    own,
    target,
    ownTracker: tracker(ownSunk),
    targetTracker: tracker(targetSunk),
    ready: snapshot.you.ready,
    opponentReady: Boolean(opponent?.ready),
    canClaimAbandoned: (status === 'placing' || status === 'battle') && awayLongEnough(opponent, context.serverNow),
    canForfeit: status === 'placing' || status === 'battle',
  };

  if (status === 'waiting') {
    return { ...vm, screen: 'waiting', status: 'Waiting for an opponent — share the link', tone: 'neutral' };
  }

  if (status === 'placing') {
    let line: string;
    if (!vm.ready) {
      line = vm.opponentReady ? `${them} is ready — place your fleet` : 'Place your fleet';
    } else {
      line = vm.opponentReady ? 'Both fleets ready' : `Fleet ready — waiting for ${them}`;
    }
    return { ...vm, screen: 'placing', status: line, canUnready: vm.ready && !vm.opponentReady };
  }

  if (status === 'battle') {
    const myTurn = snapshot.currentSeatId === me.seatId;
    const open = snapshot.turnOpensAt === null || context.serverNow >= snapshot.turnOpensAt;
    const firstTurnPending = snapshot.turnNumber === 0 && !open;
    let line: string;
    let reason: string | null = null;
    let tone: Tone = myTurn ? 'mine' : 'theirs';
    if (context.resolving) {
      line = 'Resolving…';
      reason = 'Wait for the shot to land.';
      tone = 'neutral';
    } else if (firstTurnPending) {
      line = myTurn ? 'Battle stations — you fire first' : `Battle stations — ${them} fires first`;
      reason = 'The battle is about to begin.';
    } else if (myTurn) {
      line = open ? 'Your turn — choose a target' : 'Your turn — stand by…';
      reason = open ? null : 'Your guns are reloading.';
    } else if (opponent && !opponent.connected) {
      line = `${them} is away — their turn is on hold`;
      reason = `It is ${them}'s turn.`;
    } else {
      line = `${them} is targeting…`;
      reason = `It is ${them}'s turn.`;
    }
    if (context.offline) {
      reason = 'Reconnecting…';
    }
    return {
      ...vm,
      screen: 'battle',
      myTurn,
      canFire: myTurn && open && !context.resolving && !context.offline,
      fireBlockedReason: reason,
      status: line,
      tone,
    };
  }

  const won = snapshot.winnerSeatId === me.seatId;
  const voted = snapshot.rematchVotes.includes(me.seatId);
  const opponentVoted = opponent ? snapshot.rematchVotes.includes(opponent.seatId) : false;
  return {
    ...vm,
    screen: 'finished',
    won,
    endReason: snapshot.endReason,
    status: won ? 'Victory' : 'Defeat',
    tone: won ? 'win' : 'lose',
    rematchVoted: voted,
    opponentRematchVoted: opponentVoted,
    canRematch: !voted && Boolean(opponent?.connected),
  };
}
