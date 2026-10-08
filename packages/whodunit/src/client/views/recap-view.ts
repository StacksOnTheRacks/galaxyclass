import type { GameRecap, PublicSeat } from '../../protocol.js';
import { ROOM_NAME, SEAT_IDS, SUSPECT_NAME, WEAPON_NAME } from '../../rules/constants.js';
import type { SeatId } from '../../rules/types.js';
import { sortCards } from '../cards.js';
import { eventLine, namesFor } from '../narrate.js';
import { h } from './dom.js';
import { cardFace } from './figures.js';

export interface DetectiveStats {
  seatId: SeatId;
  name: string;
  suggestions: number;
  /** Cards this detective showed to others. */
  shown: number;
  accused: 'right' | 'wrong' | null;
}

/** Suggestions made, cards shown, and the accusation (if any) per detective, from the case log. */
export function recapStats(recap: GameRecap, seats: PublicSeat[]): DetectiveStats[] {
  return SEAT_IDS.filter((seatId) => recap.roster[seatId] || recap.hands[seatId]).map((seatId) => {
    const seat = seats.find((s) => s.seatId === seatId);
    const accusation = recap.events.find((event) => event.kind === 'accused' && event.seatId === seatId);
    return {
      seatId,
      name: recap.roster[seatId]?.displayName ?? seat?.displayName ?? `Detective ${seatId}`,
      suggestions: recap.events.filter((event) => event.kind === 'suggested' && event.seatId === seatId).length,
      shown: recap.events.filter((event) => event.kind === 'refuted' && event.refuterSeatId === seatId).length,
      accused: accusation?.kind === 'accused' ? (accusation.correct ? 'right' : 'wrong') : null,
    };
  });
}

function duration(recap: GameRecap): string | null {
  if (!recap.startedAt || !recap.endedAt) {
    return null;
  }
  const ms = Date.parse(recap.endedAt) - Date.parse(recap.startedAt);
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** The case file opened: the three cards, every detective's hand, and the whole case log. */
export function renderRecap(recap: GameRecap, seats: PublicSeat[], me: SeatId | null): HTMLElement {
  const stats = recapStats(recap, seats);
  const names = namesFor(seats, me, recap.roster);
  const time = duration(recap);
  const turns = recap.events.filter((event) => event.kind === 'turn_passed').length + 1;
  const { solution } = recap;
  const hands = stats.map((s) => {
    const suspect = recap.roster[s.seatId]?.suspect;
    const verdict = s.accused === 'right' ? 'Solved it' : s.accused === 'wrong' ? 'Accused wrongly' : null;
    return h(
      'figure',
      { class: 'wd-recap-hand', 'data-seat': s.seatId },
      h(
        'figcaption',
        {},
        h('strong', {}, s.name),
        suspect ? ` as ${SUSPECT_NAME[suspect]}` : '',
        h('small', {}, [`${s.suggestions} ${s.suggestions === 1 ? 'suggestion' : 'suggestions'}`, `${s.shown} shown`, verdict].filter(Boolean).join(' · ')),
      ),
      h('div', { class: 'wd-recap-cards' }, ...sortCards(recap.hands[s.seatId] ?? []).map((card) => cardFace(card, 'span'))),
    );
  });
  return h(
    'section',
    { class: 'wd-recap', 'aria-label': 'The case file', 'data-testid': 'recap' },
    h('h3', { class: 'wd-recap-title' }, 'The case file'),
    h(
      'div',
      { class: 'wd-recap-solution', role: 'img', 'aria-label': `${SUSPECT_NAME[solution.suspect]} with the ${WEAPON_NAME[solution.weapon]} in the ${ROOM_NAME[solution.room]}` },
      cardFace(solution.suspect),
      cardFace(solution.weapon),
      cardFace(solution.room),
    ),
    h('p', { class: 'wd-recap-meta' }, [`${turns} ${turns === 1 ? 'turn' : 'turns'}`, time ? `in ${time}` : null].filter(Boolean).join(' ')),
    h('div', { class: 'wd-recap-hands' }, ...hands),
    h('h4', { class: 'wd-recap-subtitle' }, 'How it unfolded'),
    h('ol', { class: 'wd-recap-timeline' }, ...recap.events.map((event) => h('li', { 'data-kind': event.kind }, eventLine(event, names)))),
  );
}
