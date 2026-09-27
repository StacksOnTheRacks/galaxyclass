export type BootstrapErrorCode =
  | 'unauthorized'
  | 'invalid_match_id'
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'already_used'
  | 'invalid_session';

export interface BootstrapErrorBody {
  error: BootstrapErrorCode;
  message: string;
}

export function bootstrapError(
  error: BootstrapErrorCode,
  message: string,
): BootstrapErrorBody {
  return { error, message };
}
