export type DisplayNameErrorCode =
  | 'unauthorized'
  | 'match_not_found'
  | 'invalid_body'
  | 'client_supplied_state'
  | 'invalid_display_name'
  | 'not_seated'
  | 'illegal_turn';

export function displayNameError(
  error: DisplayNameErrorCode,
): { error: DisplayNameErrorCode; message?: string } {
  if (error === 'invalid_display_name') {
    return { error, message: 'Name must be 3–24 characters.' };
  }
  return { error };
}
