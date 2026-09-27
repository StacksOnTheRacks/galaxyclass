export type PlayActionErrorCode =
  | 'unauthorized'
  | 'not_occupant'
  | 'match_not_found'
  | 'seat_not_found'
  | 'invalid_body'
  | 'client_supplied_state'
  | 'illegal_action'
  | 'off_turn'
  | 'illegal_turn'
  | 'betting_not_open'
  | 'already_complete'
  | 'all_in_or_side_pot_unsupported'
  | 'holes_not_dealt'
  | 'reconstruct_failed';

export function playActionError(error: PlayActionErrorCode): { error: PlayActionErrorCode } {
  return { error };
}
