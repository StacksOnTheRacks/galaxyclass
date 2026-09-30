import { SEEDED_TABLE_MAX_SEATS, type SeedTableStakes } from './seed-table-handler.js';

export const SEEDED_TABLE_HOST_LABEL = 'Hosted by Galaxy Class';
export const SEEDED_TABLE_VARIANT_LABEL = "No-Limit Hold'em";

export interface SeededTableSpec extends SeedTableStakes {
  /** CloudFormation construct id. The first id stays stable so deploys do not remint it. */
  constructId: string;
  name: string;
}

/** Lobby order is low stakes to high. Buy-ins are 1,000 big blinds, matching the original $1/$2 table. */
export const SEEDED_TABLES: readonly SeededTableSpec[] = [
  { constructId: 'SeededTable', name: 'The Limp', smallBlind: 1, bigBlind: 2, defaultStack: 2000 },
  { constructId: 'SeededTableButton', name: 'The Button', smallBlind: 2, bigBlind: 5, defaultStack: 5000 },
  { constructId: 'SeededTableBigSlick', name: 'Big Slick', smallBlind: 5, bigBlind: 10, defaultStack: 10000 },
  {
    constructId: 'SeededTablePocketRockets',
    name: 'Pocket Rockets',
    smallBlind: 25,
    bigBlind: 50,
    defaultStack: 50000,
  },
];

export interface SeededTableListing {
  id: string;
  name: string;
  hostLabel: string;
  variantLabel: string;
  blindsLabel: string;
  buyInLabel: string;
  maxSeats: number;
}

export function buildSeededTableListing(tableId: string, spec: SeededTableSpec): SeededTableListing {
  return {
    id: tableId,
    name: spec.name,
    hostLabel: SEEDED_TABLE_HOST_LABEL,
    variantLabel: SEEDED_TABLE_VARIANT_LABEL,
    blindsLabel: `$${spec.smallBlind} / $${spec.bigBlind}`,
    buyInLabel: `Buy-in $${spec.defaultStack.toLocaleString('en-US')}`,
    maxSeats: SEEDED_TABLE_MAX_SEATS,
  };
}
