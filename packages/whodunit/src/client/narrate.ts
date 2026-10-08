import type { GameEvent, GameRecap, PublicSeat, SeatId } from '../protocol.js';
import { positionKey, type Reach } from '../rules/board.js';
import { ROOM_NAME, SUSPECT_NAME, WEAPON_NAME } from '../rules/constants.js';
import { cardName, solutionLine } from './cards.js';

/** Who a seat is, for the log: "You", or the detective's name. */
export interface Names {
  me: SeatId | null;
  name(seatId: SeatId): string;
}

export function namesFor(seats: readonly PublicSeat[], me: SeatId | null, roster?: GameRecap['roster']): Names {
  return {
    me,
    name: (seatId) => roster?.[seatId]?.displayName ?? seats.find((seat) => seat.seatId === seatId)?.displayName ?? `Detective ${seatId}`,
  };
}

function who(names: Names, seatId: SeatId): string {
  return seatId === names.me ? 'You' : names.name(seatId);
}

function list(parts: string[]): string {
  if (parts.length <= 1) {
    return parts.join('');
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** One line of the case log, from this viewer's side: a shown card is named only to the two who saw it. */
export function eventLine(event: GameEvent, names: Names): string {
  switch (event.kind) {
    case 'game_started':
      return `The case is open. ${who(names, event.firstSeatId)} ${event.firstSeatId === names.me ? 'go' : 'goes'} first.`;
    case 'rolled':
      return `${who(names, event.seatId)} rolled ${event.dice[0]} and ${event.dice[1]}: ${event.dice[0] + event.dice[1]}.`;
    case 'moved': {
      const to = event.path.at(-1);
      if (event.via === 'passage' && to?.kind === 'room') {
        return `${who(names, event.seatId)} slipped through the secret passage to the ${ROOM_NAME[to.room]}.`;
      }
      if (to?.kind === 'room') {
        return `${who(names, event.seatId)} walked into the ${ROOM_NAME[to.room]}.`;
      }
      const steps = event.path.length - 1;
      return `${who(names, event.seatId)} crept ${steps} ${steps === 1 ? 'square' : 'squares'} down the hall.`;
    }
    case 'suggested': {
      const head = `${who(names, event.seatId)} ${event.seatId === names.me ? 'suggest' : 'suggests'} ${SUSPECT_NAME[event.suspect]} with the ${WEAPON_NAME[event.weapon]} in the ${ROOM_NAME[event.room]}.`;
      const passed = event.passed.length > 0 ? ` ${list(event.passed.map((seatId) => who(names, seatId)))} could not refute.` : '';
      const tail = event.refuterSeatId
        ? ` ${who(names, event.refuterSeatId)} ${event.refuterSeatId === names.me ? 'have' : 'has'} a card to show.`
        : ' Nobody could refute it!';
      return `${head}${passed}${tail}`;
    }
    case 'refuted':
      if (event.card && event.suggesterSeatId === names.me) {
        return `${names.name(event.refuterSeatId)} showed you ${cardName(event.card)}.`;
      }
      if (event.card && event.refuterSeatId === names.me) {
        return `You showed ${names.name(event.suggesterSeatId)} ${cardName(event.card)}.`;
      }
      return `${who(names, event.refuterSeatId)} showed ${names.name(event.suggesterSeatId)} a card.`;
    case 'accused': {
      const line = `${who(names, event.seatId)} ${event.seatId === names.me ? 'accuse' : 'accuses'} ${SUSPECT_NAME[event.suspect]} with the ${WEAPON_NAME[event.weapon]} in the ${ROOM_NAME[event.room]}`;
      return event.correct ? `${line}, and ${event.seatId === names.me ? 'you are' : 'is'} right!` : `${line}, and ${event.seatId === names.me ? 'you are' : 'is'} wrong.`;
    }
    case 'turn_passed':
      return event.nextSeatId === names.me ? 'Your turn.' : `${names.name(event.nextSeatId)}'s turn.`;
    case 'departed': {
      const cards = event.revealed.map(cardName);
      const left = event.reason === 'abandoned' ? 'was cleared from the table' : 'left the case';
      return `${who(names, event.seatId)} ${left}.${cards.length > 0 ? ` Their cards are face up: ${list(cards)}.` : ''}`;
    }
    case 'game_over':
      if (event.reason === 'solved' && event.winnerSeatId) {
        return `${who(names, event.winnerSeatId)} solved it: ${solutionLine(event.solution)}.`;
      }
      if (event.reason === 'unsolved') {
        return `Nobody solved it. It was ${solutionLine(event.solution)}.`;
      }
      return `The case was abandoned. It was ${solutionLine(event.solution)}.`;
  }
}

/** Accessible name for a destination on the board or in the room list. */
export function destinationLabel(reach: Reach): string {
  const to = reach.destination;
  if (to.kind === 'room') {
    return `${ROOM_NAME[to.room]}, ${reach.steps} ${reach.steps === 1 ? 'step' : 'steps'}`;
  }
  return `Hall square ${to.x + 1}, ${to.y + 1}, ${reach.steps} ${reach.steps === 1 ? 'step' : 'steps'}`;
}

/** `room:parlor` or `hall:7,4`: the `data-dest` key e2e and the board share. */
export function destinationKey(reach: Reach): string {
  return positionKey(reach.destination);
}
