import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnurApiError, type TurnurClient } from '@turnur/sdk';
import {
  authenticateTurnurSession,
  getTurnurSession,
  requireAuthenticatedTurnurClient,
  resetTurnurSession,
  TurnurAuthenticationError,
} from '../src/server/turnur/session.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';
import {
  TEST_TURNUR_BASE_URL,
  TEST_TURNUR_GAME_ID,
  TEST_TURNUR_SDK_KEY,
} from './helpers/turnur-fixtures.js';

function createFakeClient(options: {
  gameId?: string;
  meError?: TurnurApiError;
  track?: {
    createCalls: number;
    meCalls: number;
    seatCreateCalls: number;
    turnSetCalls: number;
    viewPutCalls: number;
    moveCreateCalls: number;
  };
}): TurnurClient {
  const track = options.track;
  return {
    game: {
      me: vi.fn(async () => {
        track && (track.meCalls += 1);
        if (options.meError) {
          throw options.meError;
        }
        return { gameId: options.gameId ?? TEST_TURNUR_GAME_ID };
      }),
    },
    match: {
      create: vi.fn(),
      get: vi.fn(),
      seat: {
        create: vi.fn(async () => {
          track && (track.seatCreateCalls += 1);
          return { seatId: 'seat-1', currentSeat: null };
        }),
        list: vi.fn(),
      },
      turn: {
        get: vi.fn(),
        set: vi.fn(async () => {
          track && (track.turnSetCalls += 1);
          return { currentSeat: 'seat-1' };
        }),
      },
      move: {
        create: vi.fn(async () => {
          track && (track.moveCreateCalls += 1);
          return {
            seq: 1,
            seatId: 'seat-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            currentSeat: 'seat-1',
          };
        }),
      },
      view: {
        put: vi.fn(async () => {
          track && (track.viewPutCalls += 1);
          return { seatId: 'seat-1' };
        }),
        get: vi.fn(),
      },
      moves: {
        list: vi.fn(),
      },
    },
  };
}

async function probeMatchOperations(client: TurnurClient, matchId: string): Promise<void> {
  await client.match.seat.create(matchId);
  await client.match.turn.set(matchId, 'seat-1');
  await client.match.view.put(matchId, 'seat-1', { hidden: true });
  await client.match.move.create(matchId, { seatId: 'seat-1', payload: { action: 'check' } });
}

describe('Turnur session authentication', () => {
  beforeEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
  });

  afterEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
    vi.restoreAllMocks();
  });

  it('authenticates with fixture env and caches the client', async () => {
    const track = {
      createCalls: 0,
      meCalls: 0,
      seatCreateCalls: 0,
      turnSetCalls: 0,
      viewPutCalls: 0,
      moveCreateCalls: 0,
    };
    const fakeClient = createFakeClient({ track });
    const createClient = vi.fn(() => {
      track.createCalls += 1;
      return fakeClient;
    });

    process.env.TURNUR_BASE_URL = TEST_TURNUR_BASE_URL;
    process.env.TURNUR_SDK_KEY = TEST_TURNUR_SDK_KEY;

    const first = await authenticateTurnurSession({ createClient });
    expect(first.status).toBe('authenticated');
    if (first.status === 'authenticated') {
      expect(first.gameId).toBe(TEST_TURNUR_GAME_ID);
    }
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: TEST_TURNUR_SDK_KEY,
    });
    expect(fakeClient.game.me).toHaveBeenCalledTimes(1);

    const second = await authenticateTurnurSession({ createClient });
    expect(second.status).toBe('authenticated');
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(fakeClient.game.me).toHaveBeenCalledTimes(1);
    expect(getTurnurSession()?.status).toBe('authenticated');
  });

  it('reuses the authenticated client for subsequent match-operation probes', async () => {
    const track = {
      createCalls: 0,
      meCalls: 0,
      seatCreateCalls: 0,
      turnSetCalls: 0,
      viewPutCalls: 0,
      moveCreateCalls: 0,
    };
    const fakeClient = createFakeClient({ track });
    const createClient = vi.fn(() => {
      track.createCalls += 1;
      return fakeClient;
    });

    const firstClient = await requireAuthenticatedTurnurClient({
      createClient,
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: TEST_TURNUR_SDK_KEY,
    });
    await probeMatchOperations(firstClient, TEST_MATCH_ID);

    const secondClient = await requireAuthenticatedTurnurClient({
      createClient,
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: TEST_TURNUR_SDK_KEY,
    });
    await probeMatchOperations(secondClient, TEST_MATCH_ID);

    expect(firstClient).toBe(secondClient);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(track.seatCreateCalls).toBe(2);
    expect(track.turnSetCalls).toBe(2);
    expect(track.viewPutCalls).toBe(2);
    expect(track.moveCreateCalls).toBe(2);
  });

  it('rejects missing SDK key without constructing a client', async () => {
    const createClient = vi.fn(() => createFakeClient({}));

    const session = await authenticateTurnurSession({
      createClient,
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: '',
    });

    expect(session).toEqual({ status: 'unauthenticated', reason: 'missing_key' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects missing base URL without constructing a client', async () => {
    const createClient = vi.fn(() => createFakeClient({}));

    const session = await authenticateTurnurSession({
      createClient,
      baseUrl: '   ',
      apiKey: TEST_TURNUR_SDK_KEY,
    });

    expect(session).toEqual({ status: 'unauthenticated', reason: 'missing_config' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects invalid SDK key with 401 and does not cache as authenticated', async () => {
    const fakeClient = createFakeClient({
      meError: new TurnurApiError(401, 'game auth required', 'game_auth_invalid'),
    });
    const createClient = vi.fn(() => fakeClient);

    const session = await authenticateTurnurSession({
      createClient,
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: 'turnur_sk_invalid',
    });

    expect(session).toEqual({ status: 'unauthenticated', reason: 'invalid_key' });
    expect(getTurnurSession()?.status).toBe('unauthenticated');
  });

  it('fail-closed: refuses match operations when authentication never succeeded', async () => {
    const track = {
      createCalls: 0,
      meCalls: 0,
      seatCreateCalls: 0,
      turnSetCalls: 0,
      viewPutCalls: 0,
      moveCreateCalls: 0,
    };
    const fakeClient = createFakeClient({
      meError: new TurnurApiError(401, 'game auth required', 'game_auth_invalid'),
      track,
    });
    const createClient = vi.fn(() => fakeClient);

    await expect(
      requireAuthenticatedTurnurClient({
        createClient,
        baseUrl: TEST_TURNUR_BASE_URL,
        apiKey: 'turnur_sk_invalid',
      }),
    ).rejects.toBeInstanceOf(TurnurAuthenticationError);

    expect(track.seatCreateCalls).toBe(0);
    expect(track.turnSetCalls).toBe(0);
    expect(track.viewPutCalls).toBe(0);
    expect(track.moveCreateCalls).toBe(0);
  });

  it('does not echo the SDK key or Authorization in logs on success or failure', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeClient = createFakeClient({});
    const createClient = vi.fn(() => fakeClient);

    await authenticateTurnurSession({
      createClient,
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: TEST_TURNUR_SDK_KEY,
    });

    resetTurnurSession();
    const failingClient = createFakeClient({
      meError: new TurnurApiError(401, 'game auth required', 'game_auth_invalid'),
    });
    await authenticateTurnurSession({
      createClient: vi.fn(() => failingClient),
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: TEST_TURNUR_SDK_KEY,
    });

    const logOutput = [
      ...infoSpy.mock.calls.flat().map(String),
      ...warnSpy.mock.calls.flat().map(String),
    ].join('\n');

    expect(logOutput).not.toContain(TEST_TURNUR_SDK_KEY);
    expect(logOutput).not.toContain('Authorization');
    expect(logOutput).not.toContain('apiKey');
  });

  it('does not include the SDK key in authentication error messages', async () => {
    await expect(
      requireAuthenticatedTurnurClient({
        createClient: vi.fn(() => createFakeClient({})),
        baseUrl: TEST_TURNUR_BASE_URL,
        apiKey: TEST_TURNUR_SDK_KEY,
      }),
    ).resolves.toBeDefined();

    resetTurnurSession();

    await expect(
      requireAuthenticatedTurnurClient({
        createClient: vi.fn(() =>
          createFakeClient({
            meError: new TurnurApiError(401, 'game auth required', 'game_auth_invalid'),
          }),
        ),
        baseUrl: TEST_TURNUR_BASE_URL,
        apiKey: TEST_TURNUR_SDK_KEY,
      }),
    ).rejects.toMatchObject({
      reason: 'invalid_key',
      message: expect.not.stringContaining(TEST_TURNUR_SDK_KEY),
    });
  });
});

describe('bootstrap routes without Turnur credentials', () => {
  it('mint still succeeds when TURNUR_SDK_KEY is unset', async () => {
    const { createTestApp } = await import('./helpers/test-app.js');
    const { authHeaders } = await import('./helpers/test-app.js');
    const { TEST_MATCH_ID } = await import('./helpers/fixtures.js');

    delete process.env.TURNUR_SDK_KEY;
    delete process.env.TURNUR_BASE_URL;

    const { app } = createTestApp();
    const response = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });

    expect(response.status).toBe(200);
  });
});
