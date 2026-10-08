import type { CardId, ClientActionName, PublicSeat, SeatId, Solution, TableSnapshot, YouView } from '../protocol.js';
import { occupiedHalls, reachable, ROOM_LAYOUT, type Reach } from '../rules/board.js';
import {
  AWAY_ABANDON_AFTER_MS,
  MIN_PLAYERS,
  ROOM_NAME,
  SETUP_AWAY_AFTER_MS,
  SUSPECTS,
  type SuspectInfo,
} from '../rules/constants.js';
import type { EndReason, RoomId, SuspectId, TokenPosition, TurnPhase } from '../rules/types.js';
import { sortCards } from './cards.js';

export type Screen = 'connecting' | 'notice' | 'setup' | 'playing' | 'finished';

export type Tone = 'mine' | 'theirs' | 'neutral' | 'win' | 'lose';

export interface SuspectPick extends SuspectInfo {
  /** The detective playing this suspect, if any. */
  takenBy: PublicSeat | null;
  mine: boolean;
}

export interface SetupView {
  picks: SuspectPick[];
  ready: boolean;
  canPick: boolean;
  canReady: boolean;
  canUnready: boolean;
  isHost: boolean;
  canStart: boolean;
  /** Why the host cannot start yet; null when they can (or when not the host). */
  startBlockedReason: string | null;
  seatedCount: number;
  readyCount: number;
  hostName: string | null;
}

export interface ViewModel {
  screen: Screen;
  notice: { title: string; body: string } | null;
  me: PublicSeat | null;
  status: string;
  tone: Tone;
  setup: SetupView;
  isHost: boolean;
  currentSeat: PublicSeat | null;
  myTurn: boolean;
  /** The server will accept an action now (the last animation has played). */
  open: boolean;
  phase: TurnPhase | null;
  dice: [number, number] | null;
  mySuspect: SuspectId | null;
  myPosition: TokenPosition | null;
  /** The room your token stands in, if any. */
  myRoom: RoomId | null;
  eliminated: boolean;
  canRoll: boolean;
  canPassage: boolean;
  passageTo: RoomId | null;
  canMove: boolean;
  /** Where your token may go with the dice, as the server computes it. */
  destinations: Reach[];
  canSuggest: boolean;
  canAccuse: boolean;
  canEndTurn: boolean;
  /** The line under the dice: what you can do now, or why you cannot. */
  hint: string;
  /** Read out when a refused intent is attempted. */
  blockedReason: string | null;
  refute: YouView['refute'];
  canRefute: boolean;
  hand: CardId[];
  won: boolean | null;
  winnerName: string | null;
  endReason: EndReason | null;
  solution: Solution | null;
  canNewGame: boolean;
  canClaimAbandoned: boolean;
}

export interface ViewContext {
  /** Server epoch ms. */
  serverNow: number;
  /** An event animation is still playing. */
  resolving: boolean;
  /** The table connection is down. */
  offline?: boolean;
  /** The action sent and not yet answered. */
  pending?: ClientActionName | null;
}

export function seatName(seat: PublicSeat | null | undefined): string {
  return seat?.displayName ?? 'A detective';
}

function awayFor(seat: PublicSeat, serverNow: number, limit: number): boolean {
  if (!seat.occupied || seat.connected) {
    return false;
  }
  const since = seat.awaySince ? Date.parse(seat.awaySince) : Number.NaN;
  return Number.isFinite(since) && serverNow - since >= limit;
}

function setupView(snapshot: TableSnapshot, me: PublicSeat | null, context: ViewContext): SetupView {
  const seated = snapshot.seats.filter((seat) => seat.occupied);
  const isHost = Boolean(me && snapshot.hostSeatId === me.seatId);
  const host = snapshot.seats.find((seat) => seat.seatId === snapshot.hostSeatId) ?? null;
  const picks = SUSPECTS.map((info) => {
    const takenBy = seated.find((seat) => seat.suspect === info.id) ?? null;
    return { ...info, takenBy, mine: Boolean(me && takenBy?.seatId === me.seatId) };
  });
  const inSetup = snapshot.status === 'setup' && Boolean(me) && !context.offline;
  let reason: string | null = null;
  if (seated.length < MIN_PLAYERS) {
    reason = `A case needs at least ${MIN_PLAYERS} detectives (${seated.length} seated).`;
  } else if (seated.some((seat) => !seat.suspect)) {
    reason = 'Everyone needs to choose a suspect.';
  } else if (seated.some((seat) => !seat.connected)) {
    reason = 'Someone is away from the table.';
  } else if (seated.some((seat) => !seat.ready)) {
    const waiting = seated.filter((seat) => !seat.ready).length;
    reason = `Waiting for ${waiting} ${waiting === 1 ? 'detective' : 'detectives'} to ready up.`;
  }
  return {
    picks,
    ready: Boolean(me?.ready),
    canPick: inSetup && !me?.ready,
    canReady: inSetup && Boolean(me?.suspect) && !me?.ready,
    canUnready: inSetup && Boolean(me?.ready),
    isHost,
    canStart: inSetup && isHost && reason === null,
    startBlockedReason: isHost ? reason : null,
    seatedCount: seated.length,
    readyCount: seated.filter((seat) => seat.ready).length,
    hostName: host?.occupied ? host.displayName : null,
  };
}

const END_COPY: Record<EndReason, { win: string; other: string }> = {
  solved: { win: 'You cracked the case.', other: 'solved the case.' },
  unsolved: { win: 'The case went cold.', other: 'Every accusation was wrong. The case went cold.' },
  abandoned: { win: 'The case was abandoned.', other: 'Too few detectives remained. The case was abandoned.' },
};

export function endLine(won: boolean, reason: EndReason | null, winnerName: string | null): string {
  if (reason === 'solved') {
    return won ? END_COPY.solved.win : `${winnerName ?? 'Another detective'} ${END_COPY.solved.other}`;
  }
  return reason ? END_COPY[reason].other : 'The case is closed.';
}

const PENDING_HINT: Partial<Record<ClientActionName, string>> = {
  roll: 'Rolling…',
  move: 'Moving…',
  take_passage: 'Taking the passage…',
  suggest: 'Making your suggestion…',
  show_card: 'Showing the card…',
  accuse: 'Opening the case file…',
  end_turn: 'Ending your turn…',
};

export function viewModel(snapshot: TableSnapshot | null, context: ViewContext): ViewModel {
  const base: ViewModel = {
    screen: 'connecting',
    notice: null,
    me: null,
    status: context.offline ? 'Reconnecting…' : 'Joining the table…',
    tone: 'neutral',
    setup: {
      picks: SUSPECTS.map((info) => ({ ...info, takenBy: null, mine: false })),
      ready: false,
      canPick: false,
      canReady: false,
      canUnready: false,
      isHost: false,
      canStart: false,
      startBlockedReason: null,
      seatedCount: 0,
      readyCount: 0,
      hostName: null,
    },
    isHost: false,
    currentSeat: null,
    myTurn: false,
    open: false,
    phase: null,
    dice: null,
    mySuspect: null,
    myPosition: null,
    myRoom: null,
    eliminated: false,
    canRoll: false,
    canPassage: false,
    passageTo: null,
    canMove: false,
    destinations: [],
    canSuggest: false,
    canAccuse: false,
    canEndTurn: false,
    hint: '',
    blockedReason: null,
    refute: null,
    canRefute: false,
    hand: [],
    won: null,
    winnerName: null,
    endReason: null,
    solution: null,
    canNewGame: false,
    canClaimAbandoned: false,
  };
  if (!snapshot) {
    return base;
  }

  const me = snapshot.seats.find((seat) => seat.isLocal && seat.occupied) ?? null;
  if (!snapshot.you || !me) {
    if (snapshot.status === 'playing') {
      return {
        ...base,
        screen: 'notice',
        notice: { title: 'A case is under way — seats are locked', body: 'These detectives are mid-investigation. Check back when the case is closed.' },
        status: 'Seats are locked',
      };
    }
    if (snapshot.seats.every((seat) => seat.occupied)) {
      return {
        ...base,
        screen: 'notice',
        notice: { title: 'This table is full', body: 'All six seats are taken. Ask the host for another table, or start your own.' },
        status: 'Table full',
      };
    }
    return base;
  }

  const you = snapshot.you;
  const status = snapshot.status;
  const setup = setupView(snapshot, me, context);
  const isHost = setup.isHost;
  const others = snapshot.seats.filter((seat) => seat.occupied && seat.seatId !== me.seatId);
  const vm: ViewModel = {
    ...base,
    me,
    setup,
    isHost,
    hand: sortCards(you.hand),
    mySuspect: you.suspect ?? me.suspect,
    eliminated: me.eliminated,
    canClaimAbandoned:
      (status === 'setup' && others.some((seat) => awayFor(seat, context.serverNow, SETUP_AWAY_AFTER_MS))) ||
      (status === 'playing' && others.some((seat) => awayFor(seat, context.serverNow, AWAY_ABANDON_AFTER_MS))),
  };

  if (status === 'setup') {
    let line: string;
    if (!me.suspect) {
      line = 'Choose your suspect';
    } else if (!me.ready) {
      line = 'Ready up when you are set';
    } else if (setup.canStart) {
      line = 'Everyone is ready — start the case';
    } else if (isHost) {
      line = setup.startBlockedReason ?? 'Waiting for the table';
    } else {
      line = setup.readyCount === setup.seatedCount && setup.seatedCount >= MIN_PLAYERS ? `Waiting for ${setup.hostName ?? 'the host'} to start` : 'Waiting for the other detectives';
    }
    return { ...vm, screen: 'setup', status: line, tone: me.ready ? 'neutral' : 'mine' };
  }

  if (status === 'playing') {
    const current = snapshot.seats.find((seat) => seat.seatId === snapshot.currentSeatId) ?? null;
    const myTurn = snapshot.currentSeatId === me.seatId;
    const open = snapshot.nextActionAt === null || context.serverNow >= snapshot.nextActionAt;
    const turn = snapshot.turn;
    const phase = turn?.phase ?? null;
    const mySuspect = vm.mySuspect;
    const position = mySuspect && snapshot.positions ? snapshot.positions[mySuspect] : null;
    const myRoom = position?.kind === 'room' ? position.room : null;
    const idle = open && !context.resolving && !context.offline && !context.pending;
    const acting = myTurn && idle && !me.eliminated;
    const passageTo = myRoom ? (ROOM_LAYOUT[myRoom].passage ?? null) : null;
    const suggestable =
      Boolean(myRoom) && !turn?.suggestion && ((phase === 'moved' && turn?.enteredRoom === myRoom) || (phase === 'start' && you.pulledIn));
    const canRoll = acting && phase === 'start';
    const canMove = acting && phase === 'moving' && Boolean(turn?.dice) && Boolean(position);
    const destinations =
      canMove && position && mySuspect && turn?.dice && snapshot.positions
        ? reachable(position, turn.dice[0] + turn.dice[1], occupiedHalls(snapshot.positions, mySuspect))
        : [];
    const refute = you.refute;
    const canRefute = Boolean(refute) && idle;
    const them = seatName(current);

    let line: string;
    let tone: Tone = myTurn ? 'mine' : 'theirs';
    let hint = '';
    let blocked: string | null = null;
    if (refute) {
      line = `Show ${seatName(snapshot.seats.find((seat) => seat.seatId === refute.suggesterSeatId))} a card`;
      hint = 'Choose one of your matching cards. Only the two of you will see it.';
      tone = 'mine';
    } else if (context.resolving) {
      line = myTurn ? 'Your turn' : `${them}'s turn`;
      blocked = 'Wait for the moment to play out.';
    } else if (snapshot.turnNumber === 0 && !open) {
      line = myTurn ? 'The case is open — you go first' : `The case is open — ${them} goes first`;
      blocked = 'The case is about to begin.';
    } else if (myTurn && me.eliminated) {
      line = 'You are out of the running';
      blocked = 'A wrong accusation took you out. You still show cards.';
    } else if (myTurn) {
      switch (phase) {
        case 'start':
          line = 'Your turn — roll the dice';
          hint = suggestable
            ? `You were pulled into the ${ROOM_NAME[myRoom!]}: you may suggest without moving.`
            : passageTo
              ? `Roll, or take the secret passage to the ${ROOM_NAME[passageTo]}.`
              : 'Roll the dice to move.';
          break;
        case 'moving': {
          const sum = turn?.dice ? turn.dice[0] + turn.dice[1] : 0;
          line = `You rolled ${sum} — choose where to go`;
          hint = destinations.length > 0 ? 'Pick a lit square or a room on the board.' : 'You are boxed in. End your turn.';
          break;
        }
        case 'moved':
          line = suggestable ? `Make a suggestion in the ${ROOM_NAME[myRoom!]}` : 'Your move is done';
          hint = suggestable ? 'Name a suspect and a weapon, or end your turn.' : 'Accuse if you are sure, or end your turn.';
          break;
        case 'refuting':
          line = `${seatName(snapshot.seats.find((seat) => seat.seatId === turn?.refuterSeatId))} is choosing a card to show you`;
          blocked = 'Wait for the card.';
          break;
        default:
          line = 'Accuse, or end your turn';
          hint = 'Check your notepad before you accuse: a wrong accusation takes you out.';
          break;
      }
      if (!open) {
        blocked = 'Wait for the moment to play out.';
      }
    } else {
      tone = 'theirs';
      if (current && !current.connected) {
        line = `${them} is away — their turn is on hold`;
      } else if (phase === 'refuting' && turn?.refuterSeatId) {
        line = `${seatName(snapshot.seats.find((seat) => seat.seatId === turn.refuterSeatId))} is choosing a card to show ${them}`;
      } else {
        line = `${them} is investigating…`;
      }
      blocked = `It is ${them}'s turn.`;
      hint = me.eliminated ? 'You are out of the running, but you still show cards.' : '';
    }
    if (context.pending && PENDING_HINT[context.pending]) {
      hint = PENDING_HINT[context.pending]!;
    }
    if (context.offline) {
      blocked = 'Reconnecting…';
    }
    return {
      ...vm,
      screen: 'playing',
      status: line,
      tone,
      hint,
      blockedReason: blocked,
      currentSeat: current,
      myTurn,
      open,
      phase,
      dice: turn?.dice ?? null,
      myPosition: position,
      myRoom,
      canRoll,
      canPassage: canRoll && passageTo !== null,
      passageTo,
      canMove,
      destinations,
      canSuggest: acting && suggestable,
      canAccuse: acting && phase !== 'refuting',
      canEndTurn: acting && phase !== 'refuting',
      refute,
      canRefute,
    };
  }

  const winner = snapshot.seats.find((seat) => seat.seatId === snapshot.winnerSeatId) ?? null;
  const winnerName = winner?.displayName ?? (snapshot.winnerSeatId ? snapshot.recap?.roster[snapshot.winnerSeatId]?.displayName ?? null : null);
  const won = snapshot.winnerSeatId === me.seatId;
  const reason = snapshot.endReason;
  return {
    ...vm,
    screen: 'finished',
    won,
    winnerName,
    endReason: reason,
    solution: snapshot.solution,
    status: won ? 'Case solved!' : reason === 'solved' ? `${winnerName ?? 'Another detective'} solved the case` : reason === 'unsolved' ? 'The case went cold' : 'Case closed',
    tone: won ? 'win' : 'lose',
    hint: isHost ? 'Open a new case when everyone is ready.' : `Waiting for ${setup.hostName ?? 'the host'} to open a new case.`,
    canNewGame: isHost && !context.offline,
  };
}

/** For HUD and setup: the seats that have a detective, in seat order. */
export function seatedSeats(snapshot: TableSnapshot | null): PublicSeat[] {
  return snapshot?.seats.filter((seat) => seat.occupied) ?? [];
}

export function seatById(snapshot: TableSnapshot | null, seatId: SeatId | null): PublicSeat | null {
  return seatId ? (snapshot?.seats.find((seat) => seat.seatId === seatId) ?? null) : null;
}
