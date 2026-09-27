export const CLIENT_SUPPLIED_STATE_KEYS = [
  'stack',
  'pot',
  'deal',
  'board',
  'hole',
  'holes',
  'holeCards',
  'shoe',
  'deckRemaining',
  'burns',
  'blinds',
] as const;

export type MatchStoreErrorCode =
  | 'illegal_turn'
  | 'match_not_found'
  | 'seat_not_found'
  | 'seat_occupied'
  | 'already_seated'
  | 'not_seated'
  | 'not_occupant'
  | 'client_supplied_state'
  | 'invalid_seat_count'
  | 'not_enough_seats'
  | 'hand_already_open'
  | 'invalid_payload'
  | 'invalid_deal'
  | 'off_turn'
  | 'illegal_action'
  | 'all_in_or_side_pot_unsupported'
  | 'already_complete'
  | 'betting_not_open'
  | 'holes_not_dealt'
  | 'reconstruct_failed'
  | 'street_not_complete'
  | 'cannot_advance'
  | 'advance_failed';

export function hasClientSuppliedStateKeys(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  for (const key of Object.keys(input)) {
    if ((CLIENT_SUPPLIED_STATE_KEYS as readonly string[]).includes(key)) {
      return true;
    }
  }
  return false;
}
