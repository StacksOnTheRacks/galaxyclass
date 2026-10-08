import type { GameRecap, PublicSeat, ShotRecord } from '../../protocol.js';
import { BOARD_SIZE, FLEET, SEAT_IDS } from '../../rules/constants.js';
import { shipCells } from '../../rules/fleet.js';
import type { Fleet, SeatId } from '../../rules/types.js';
import { h } from './dom.js';

export interface CaptainStats {
  seatId: SeatId;
  name: string;
  shots: number;
  hits: number;
  accuracy: number;
  sunk: number;
}

/** Shots, hits, accuracy, and ships sunk per captain, from the after-action record. */
export function recapStats(recap: GameRecap, seats: PublicSeat[]): CaptainStats[] {
  return SEAT_IDS.filter((seatId) => recap.roster[seatId] || recap.fleets[seatId]).map((seatId) => {
    const fired = recap.shots.filter((shot) => shot.shooter === seatId);
    const hits = fired.filter((shot) => shot.result === 'hit').length;
    const seat = seats.find((s) => s.seatId === seatId);
    return {
      seatId,
      name: recap.roster[seatId]?.displayName ?? seat?.displayName ?? `Captain ${seatId}`,
      shots: fired.length,
      hits,
      accuracy: fired.length > 0 ? Math.round((hits / fired.length) * 100) : 0,
      sunk: fired.filter((shot) => shot.sunkShip).length,
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

function miniBoard(fleet: Fleet | undefined, incoming: ShotRecord[], label: string): HTMLElement {
  const grid = h('div', { class: 'ws-mini', role: 'img', 'aria-label': label });
  const ships = new Map<number, string>();
  for (const placement of fleet ?? []) {
    for (const cell of shipCells(placement)) {
      ships.set(cell.row * BOARD_SIZE + cell.col, placement.shipId);
    }
  }
  const marks = new Map<number, string>();
  for (const shot of incoming) {
    marks.set(shot.coord.row * BOARD_SIZE + shot.coord.col, shot.result);
  }
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    grid.append(h('span', { class: 'ws-mini-cell', 'data-ship': ships.get(i), 'data-mark': marks.get(i) }));
  }
  return grid;
}

/** The after-action report: both captains' gunnery and both fleets with every shot on them. */
export function renderRecap(recap: GameRecap, seats: PublicSeat[]): HTMLElement {
  const stats = recapStats(recap, seats);
  const turns = recap.shots.length;
  const time = duration(recap);
  const rows = stats.map((s) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row' }, s.name),
      h('td', {}, String(s.shots)),
      h('td', {}, String(s.hits)),
      h('td', {}, `${s.accuracy}%`),
      h('td', {}, `${s.sunk}/${FLEET.length}`),
    ),
  );
  const boards = stats.map((s) =>
    h(
      'figure',
      { class: 'ws-recap-fleet' },
      miniBoard(
        recap.fleets[s.seatId],
        recap.shots.filter((shot) => shot.target === s.seatId),
        `${s.name}'s fleet and the shots fired at it`,
      ),
      h('figcaption', {}, `${s.name}'s fleet`),
    ),
  );
  return h(
    'section',
    { class: 'ws-recap', 'aria-label': 'After-action report' },
    h('h3', { class: 'ws-recap-title' }, 'After-action report'),
    h('p', { class: 'ws-recap-meta' }, [`${turns} shots fired`, time ? `in ${time}` : null].filter(Boolean).join(' ')),
    h(
      'table',
      { class: 'ws-recap-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Captain'), h('th', { scope: 'col' }, 'Shots'), h('th', { scope: 'col' }, 'Hits'), h('th', { scope: 'col' }, 'Accuracy'), h('th', { scope: 'col' }, 'Sunk'))),
      h('tbody', {}, ...rows),
    ),
    h('div', { class: 'ws-recap-fleets' }, ...boards),
  );
}
