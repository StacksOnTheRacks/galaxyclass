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

  const onTurnSeatId = opened.value.currentSeat;
  const onTurnPlayer = onTurnSeatId === seatA ? playerA : playerB;
  const offTurnSeatId = onTurnSeatId === seatA ? seatB : seatA;
  const offTurnPlayer = onTurnSeatId === seatA ? playerB : playerA;

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
    onTurnSeatId,
    offTurnSeatId,
    onTurnPlayer,
    offTurnPlayer,
  };
}

export function playActionUrl(matchId: string, seatId: string): string {
  return `/v1/play/matches/${matchId}/seats/${seatId}/actions`;
}

export function bearerHeaders(bearer: string): HeadersInit {
  return {
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
  };
}
