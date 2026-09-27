export type PlayViewErrorCode =
  | 'unauthorized'
  | 'not_occupant'
  | 'match_not_found'
  | 'seat_not_found';

export function playViewError(error: PlayViewErrorCode): { error: PlayViewErrorCode } {
  return { error };
}
