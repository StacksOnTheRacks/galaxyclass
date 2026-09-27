import { randomUUID } from 'node:crypto';
import type { TurnurClient } from '@turnur/sdk';
import { TurnurApiError } from '@turnur/sdk';
import { vi } from 'vitest';
import { TEST_TURNUR_GAME_ID } from './turnur-fixtures.js';

export interface FakeSeatStore {
  seats: Map<string, Array<Record<string, unknown>>>;
  views: Map<string, Map<string, unknown>>;
  moves: Map<string, Array<{ seq: number; seatId: string; payload: unknown; createdAt: string }>>;
  currentSeat: Map<string, string | null>;
  matchCreateCalls: number;
  seatCreateCalls: number;
  seatListCalls: number;
  turnGetCalls: number;
  turnSetCalls: number;
  viewPutCalls: number;
  viewGetCalls: number;
  moveCreateCalls: number;
  movesListCalls: number;
  viewPutBodies: Array<{ matchId: string; seatId: string; view: unknown }>;
  moveCreateBodies: Array<{ matchId: string; seatId: string; payload: unknown }>;
  moveCreateError?: TurnurApiError;
}

export function createFakeSeatStore(): FakeSeatStore {
  return {
    seats: new Map(),
    views: new Map(),
    moves: new Map(),
    currentSeat: new Map(),
    matchCreateCalls: 0,
    seatCreateCalls: 0,
    seatListCalls: 0,
    turnGetCalls: 0,
    turnSetCalls: 0,
    viewPutCalls: 0,
    viewGetCalls: 0,
    moveCreateCalls: 0,
    movesListCalls: 0,
    viewPutBodies: [],
    moveCreateBodies: [],
  };
}

function rosterForMatch(store: FakeSeatStore, matchId: string) {
  const roster = store.seats.get(matchId) ?? [];
  return roster.map((seat) => ({
    seatId: seat.seatId as string,
    createdAt: seat.createdAt as string,
  }));
}

function nextSeq(store: FakeSeatStore, matchId: string): number {
  const items = store.moves.get(matchId) ?? [];
  if (items.length === 0) {
    return 1;
  }
  return Math.max(...items.map((item) => item.seq)) + 1;
}

export function createFakeTurnurClientWithSeats(
  store: FakeSeatStore,
  options: {
    meError?: TurnurApiError;
    createError?: TurnurApiError;
    listError?: TurnurApiError;
    viewPutError?: TurnurApiError;
    viewGetError?: TurnurApiError;
    moveCreateError?: TurnurApiError;
  } = {},
): TurnurClient {
  return {
    game: {
      me: vi.fn(async () => {
        if (options.meError) {
          throw options.meError;
        }
        return { gameId: TEST_TURNUR_GAME_ID };
      }),
    },
    match: {
      create: vi.fn(async () => {
        store.matchCreateCalls += 1;
        const matchId = randomUUID();
        store.seats.set(matchId, []);
        store.currentSeat.set(matchId, null);
        store.moves.set(matchId, []);
        return { matchId };
      }),
      get: vi.fn(),
      seat: {
        create: vi.fn(async (matchId: string) => {
          store.seatCreateCalls += 1;
          if (options.createError) {
            throw options.createError;
          }
          const seatId = randomUUID();
          const roster = store.seats.get(matchId) ?? [];
          const latestCreatedAt = roster.reduce((latest, seat) => {
            const createdAt = String(seat.createdAt ?? '');
            return createdAt > latest ? createdAt : latest;
          }, '');
          const createdAt = latestCreatedAt
            ? new Date(Date.parse(latestCreatedAt) + 1).toISOString()
            : new Date().toISOString();
          roster.push({
            seatId,
            createdAt,
            playerId: 'planted-player-id',
            view: { hidden: true },
            holeCards: ['As', 'Kh'],
          });
          store.seats.set(matchId, roster);
          if (!store.currentSeat.has(matchId)) {
            store.currentSeat.set(matchId, null);
          }
          return { seatId, currentSeat: store.currentSeat.get(matchId) ?? null };
        }),
        list: vi.fn(async (matchId: string) => {
          store.seatListCalls += 1;
          if (options.listError) {
            throw options.listError;
          }
          return {
            seats: rosterForMatch(store, matchId),
            currentSeat: store.currentSeat.get(matchId) ?? null,
          };
        }),
      },
      turn: {
        get: vi.fn(async (matchId: string) => {
          store.turnGetCalls += 1;
          return { currentSeat: store.currentSeat.get(matchId) ?? null };
        }),
        set: vi.fn(async (matchId: string, seatId: string) => {
          store.turnSetCalls += 1;
          store.currentSeat.set(matchId, seatId);
          return { currentSeat: seatId };
        }),
      },
      move: {
        create: vi.fn(async (matchId: string, input: { seatId: string; payload: unknown }) => {
          store.moveCreateCalls += 1;
          store.moveCreateBodies.push({
            matchId,
            seatId: input.seatId,
            payload: input.payload,
          });

          const current = store.currentSeat.get(matchId) ?? null;
          const error = options.moveCreateError ?? store.moveCreateError;
          if (error) {
            throw error;
          }
          if (current === null || current !== input.seatId) {
            throw new TurnurApiError(409, 'illegal_turn');
          }

          const items = store.moves.get(matchId) ?? [];
          const entry = {
            seq: nextSeq(store, matchId),
            seatId: input.seatId,
            payload: input.payload,
            createdAt: new Date().toISOString(),
          };
          items.push(entry);
          store.moves.set(matchId, items);

          return {
            seq: entry.seq,
            seatId: input.seatId,
            createdAt: entry.createdAt,
            currentSeat: current,
          };
        }),
      },
      view: {
        put: vi.fn(async (matchId: string, seatId: string, view: unknown) => {
          store.viewPutCalls += 1;
          store.viewPutBodies.push({ matchId, seatId, view });
          if (options.viewPutError) {
            throw options.viewPutError;
          }
          const matchViews = store.views.get(matchId) ?? new Map<string, unknown>();
          matchViews.set(seatId, view);
          store.views.set(matchId, matchViews);
          return { seatId };
        }),
        get: vi.fn(async (matchId: string, seatId: string) => {
          store.viewGetCalls += 1;
          if (options.viewGetError) {
            throw options.viewGetError;
          }
          const matchViews = store.views.get(matchId);
          const view = matchViews?.get(seatId) ?? null;
          return { seatId, view };
        }),
      },
      moves: {
        list: vi.fn(async (matchId: string) => {
          store.movesListCalls += 1;
          return { items: [...(store.moves.get(matchId) ?? [])] };
        }),
      },
    },
  };
}

export function seedFakeSeats(
  store: FakeSeatStore,
  matchId: string,
  seatIds: string[],
): void {
  const baseTime = Date.now();
  const roster = seatIds.map((seatId, index) => ({
    seatId,
    createdAt: new Date(baseTime + index).toISOString(),
  }));
  store.seats.set(matchId, roster);
  store.currentSeat.set(matchId, null);
  store.moves.set(matchId, []);
}
