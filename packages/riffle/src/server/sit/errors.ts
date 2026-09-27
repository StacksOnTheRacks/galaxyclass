export type SitErrorCode =
  | 'unauthorized'
  | 'match_not_found'
  | 'invalid_body'
  | 'client_supplied_state'
  | 'seat_occupied'
  | 'illegal_turn';

export function sitError(error: SitErrorCode): { error: SitErrorCode } {
  return { error };
}
