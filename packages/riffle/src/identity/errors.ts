export type IdentityErrorCode =
  | 'invalid_email'
  | 'invalid_password'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unauthorized';

export interface IdentityErrorBody {
  error: IdentityErrorCode;
  message: string;
}

export function identityError(
  error: IdentityErrorCode,
  message: string,
): IdentityErrorBody {
  return { error, message };
}
