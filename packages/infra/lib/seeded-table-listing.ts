import { SEEDED_TABLE_DEFAULTS } from './seed-table-handler.js';

export const SEEDED_TABLE_LISTING_DISPLAY = {
  name: 'Galaxy Class Table',
  hostLabel: 'Hosted by Galaxy Class',
  variantLabel: "No-Limit Hold'em",
} as const;

export interface SeededTableListing {
  id: string;
  name: string;
  hostLabel: string;
  variantLabel: string;
  blindsLabel: string;
  buyInLabel: string;
  maxSeats: number;
}

export function buildSeededTableListing(tableId: string): SeededTableListing {
  const { smallBlind, bigBlind, defaultStack, maxSeats } = SEEDED_TABLE_DEFAULTS;
  return {
    id: tableId,
    name: SEEDED_TABLE_LISTING_DISPLAY.name,
    hostLabel: SEEDED_TABLE_LISTING_DISPLAY.hostLabel,
    variantLabel: SEEDED_TABLE_LISTING_DISPLAY.variantLabel,
    blindsLabel: `$${smallBlind} / $${bigBlind}`,
    buyInLabel: `Buy-in $${defaultStack.toLocaleString('en-US')}`,
    maxSeats,
  };
}
