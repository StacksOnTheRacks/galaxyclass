import type { RiffleEnv } from '../env.js';
import type { BootstrapLedger } from './ledger.js';
import {
  BOOTSTRAP_TTL_SECONDS,
  bootstrapExpiresAt,
  buildPlayUrl,
  mintJti,
  mintOpaqueToken,
} from './token.js';

export interface MintBootstrapInput {
  matchId: string;
}

export interface MintBootstrapResult {
  token: string;
  playUrl: string;
  jti: string;
  expiresIn: number;
}

export function mintBootstrap(
  env: RiffleEnv,
  ledger: BootstrapLedger,
  input: MintBootstrapInput,
): MintBootstrapResult {
  const token = mintOpaqueToken();
  const jti = mintJti();
  const expiresAt = bootstrapExpiresAt();

  ledger.put(token, {
    matchId: input.matchId,
    jti,
    expiresAt,
    used: false,
  });

  return {
    token,
    playUrl: buildPlayUrl(env.publicOrigin, token),
    jti,
    expiresIn: BOOTSTRAP_TTL_SECONDS,
  };
}
