import type { StartOptions } from '../runtime/actions.js';

/**
 * The tables the dev server seeds, kept apart from `server.ts` so the e2e can import them (and
 * replay the scripted deal) without starting a server.
 */

/** Seeded for the Inspector dev member; everyone else reaches them by link like any invitee. */
export const DEV_OWNER = 'dev-inspector';

export const DEV_TABLES = [
  { id: '4c1e7a2b-9d3f-4a6e-8b10-6e2d8f9a0b11', name: 'Starfall Manor' },
  { id: '9f5b2d3e-8c4a-4e7f-9b0c-1d2e3f4a5b62', name: 'Midnight case' },
  { id: 'b8d0f2a4-3c5e-4a7b-9d1f-2b4c6d8e0f13', name: 'Scripted case' },
] as const;

export const SCRIPTED_TABLE_ID = DEV_TABLES[2].id;

/**
 * The scripted case is dealt with `dealCase(players, seededRandom(SCRIPTED_DEAL_SEED), '1')`, seat 1
 * goes first, and the dice replay from SCRIPTED_DICE_SEED, so a test knows the case file up front.
 */
export const SCRIPTED_DEAL_SEED = 0x5ca1ab1e;
export const SCRIPTED_DICE_SEED = 0x0ddba11;

export function devStartOptions(tableId: string): StartOptions | undefined {
  return tableId === SCRIPTED_TABLE_ID
    ? { firstSeatId: '1', dealSeed: SCRIPTED_DEAL_SEED, diceSeed: SCRIPTED_DICE_SEED }
    : undefined;
}
