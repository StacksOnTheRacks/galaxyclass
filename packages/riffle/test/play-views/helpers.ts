import { createIdentityStore } from '../../src/identity/store.js';
import { createMatchStore } from '../../src/match-store/index.js';
import { createSeededRng } from '../../src/rules/rng.js';
import { createWsHub, type WsHub } from '../../src/ws/hub.js';
import { createTestApp } from '../helpers/test-app.js';

export function seedOpenHandFixture(options: { wsHub?: WsHub; rngSeed?: number } = {}) {
  const matchStore = createMatchStore();
  const identityStore = createIdentityStore();
  const playerA = identityStore.issueAnonymous();
  const playerB = identityStore.issueAnonymous();

  const created = matchStore.createMatch();
  if (!created.ok) {
    throw new Error('create match failed');
  }

  const { matchId } = created.value;
  const publicState = matchStore.getPublicState(matchId);
  if (!publicState.ok) {
    throw new Error('public state failed');
  }

  const seatA = publicState.value.seats[0]!.seatId;
  const seatB = publicState.value.seats[1]!.seatId;

  const bindA = matchStore.setSeatOccupant(matchId, seatA, playerA.playerSubject);
  const bindB = matchStore.setSeatOccupant(matchId, seatB, playerB.playerSubject);
  if (!bindA.ok || !bindB.ok) {
    throw new Error('bind occupants failed');
  }

  const opened = matchStore.openHand(matchId, {
    rng: createSeededRng(options.rngSeed ?? 42),
  });
  if (!opened.ok) {
    throw new Error('open hand failed');
  }

  const wsHub = options.wsHub ?? createWsHub();
  const { app } = createTestApp({ stores: { matchStore, identityStore }, wsHub });

  const viewA = matchStore.getSeatView(matchId, seatA);
  const viewB = matchStore.getSeatView(matchId, seatB);
  if (!viewA.ok || !viewB.ok) {
    throw new Error('seat views failed');
  }

  return {
    app,
    matchStore,
    identityStore,
    wsHub,
    matchId,
    seatA,
    seatB,
    playerA,
    playerB,
    holeA: viewA.value.hole,
    holeB: viewB.value.hole,
    onTurnSeatId: opened.value.currentSeat,
    offTurnSeatId: opened.value.currentSeat === seatA ? seatB : seatA,
    onTurnPlayer: opened.value.currentSeat === seatA ? playerA : playerB,
    offTurnPlayer: opened.value.currentSeat === seatA ? playerB : playerA,
  };
}

export function playViewUrl(matchId: string, seatId: string): string {
  return `/v1/play/matches/${matchId}/seats/${seatId}/view`;
}

export function playTableUrl(matchId: string, seatId: string): string {
  return `/v1/play/matches/${matchId}/seats/${seatId}/table`;
}

export function publicPlayTableUrl(matchId: string): string {
  return `/v1/play/matches/${matchId}/table`;
}

export function bearerHeaders(bearer: string): HeadersInit {
  return {
    Authorization: `Bearer ${bearer}`,
  };
}

export const HOLE_DENYLIST = [
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'HandState',
  'shoe',
  'deckRemaining',
  'burns',
] as const;

export function collectDenylistedKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDenylistedKeys(item, found);
    }
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, val] of Object.entries(value)) {
      if ((HOLE_DENYLIST as readonly string[]).includes(key)) {
        found.add(key);
      }
      collectDenylistedKeys(val, found);
    }
  }
  return found;
}

export function jsonContainsCardStrings(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /[AKQJT98765432][shdc]/.test(text);
}
