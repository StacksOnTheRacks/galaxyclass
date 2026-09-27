import { mintBootstrap } from '../bootstrap/mint.js';
import type { BootstrapLedger } from '../bootstrap/ledger.js';
import type { RiffleEnv } from '../env.js';
import { createMatch, type CreateMatchDeps } from '../matches/create.js';
import { mintSeatCapability } from '../seats/capability/mint.js';
import type { SeatCapabilityLedger } from '../seats/capability/ledger.js';
import { createSeat, type CreateSeatDeps } from '../seats/create.js';
import { mapSeatTurnurError } from '../seats/errors.js';

export interface LabSessionSeat {
  seatId: string;
  playUrl: string;
  capabilityToken: string;
  playerSubject: string;
}

export interface LabSessionResult {
  matchId: string;
  seats: LabSessionSeat[];
}

export interface LabSessionStores {
  bootstrapLedger: BootstrapLedger;
  seatCapabilityLedger: SeatCapabilityLedger;
}

export interface LabSessionDeps extends CreateMatchDeps, CreateSeatDeps {}

const LAB_SEAT_COUNT = 2;

export async function startLabSession(
  env: RiffleEnv,
  stores: LabSessionStores,
  deps: LabSessionDeps = {},
): Promise<LabSessionResult> {
  const { matchId } = await createMatch(deps);
  const seats: LabSessionSeat[] = [];

  for (let index = 0; index < LAB_SEAT_COUNT; index += 1) {
    const { seatId } = await createSeat({ matchId }, deps);
    const bootstrap = mintBootstrap(env, stores.bootstrapLedger, { matchId });
    const playerSubject = `lab:${seatId}`;
    const capability = mintSeatCapability(stores.seatCapabilityLedger, {
      matchId,
      seatId,
      playerSubject,
    });

    seats.push({
      seatId,
      playUrl: bootstrap.playUrl,
      capabilityToken: capability.token,
      playerSubject,
    });
  }

  return { matchId, seats };
}

export async function startLabSessionOrError(
  env: RiffleEnv,
  stores: LabSessionStores,
  deps: LabSessionDeps = {},
): Promise<LabSessionResult | Response> {
  try {
    return await startLabSession(env, stores, deps);
  } catch (error) {
    return mapSeatTurnurError(error);
  }
}
