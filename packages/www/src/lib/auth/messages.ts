import type { GamerTagError } from "@galaxyclass/accounts/gamer-tag";
import { SIGN_UP_ERROR_CODES } from "@galaxyclass/accounts/profile-api-contract";

export const PASSWORD_RULE =
  "Password must be at least 8 characters with upper, lower, and number.";

export const COPY = {
  passwordRule: PASSWORD_RULE,
  invalidEmail: "Enter a valid email address.",
  fixFields: "Fix the highlighted fields.",
  signInFailed: "Incorrect email or password.",
  forgotSent: "If an account exists, a reset code was sent.",
  confirmError: "Invalid or expired code.",
  codeRequired: "Enter the verification code.",
  resetSuccessTitle: "Password updated",
  resetSuccessBody: "You can sign in with your new password.",
  checkEmailTitle: "Check your email",
  configError: "Galaxy Class accounts are not configured.",
  creating: "Creating account…",
  signingIn: "Signing in…",
  resendFailed: "Could not resend the code. Try again.",
  resendSent: "A new verification code was sent.",
  signUpFailed: "Could not create the account. Try again.",
  signInGeneric: "Could not sign in. Try again.",
  resetFailed: "Could not update the password. Try again.",
} as const;

export function verificationCodeSent(email: string): string {
  return `We sent a verification code to ${email}.`;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value)
  );
}

export function cognitoName(error: unknown): string {
  if (!error || typeof error !== "object" || !("name" in error)) return "";
  const name = (error as { name: unknown }).name;
  return typeof name === "string" ? name : "";
}

/** Maps the PreSignUp trigger's error code (inside Cognito's message) to a gamer tag error. */
export function signUpGamerTagError(error: unknown): GamerTagError | "taken" | null {
  if (cognitoName(error) !== "UserLambdaValidationException") return null;
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? "");
  if (message.includes(SIGN_UP_ERROR_CODES.taken)) return "taken";
  if (message.includes(SIGN_UP_ERROR_CODES.required)) return "required";
  if (message.includes(SIGN_UP_ERROR_CODES.invalid)) return "invalid_characters";
  return null;
}

export function isDuplicateSignUp(error: unknown): boolean {
  const name = cognitoName(error);
  return name === "UsernameExistsException" || name === "AliasExistsException";
}
