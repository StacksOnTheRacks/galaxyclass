import type { ProfileErrorCode } from "./api";

export const PROFILE_COPY = {
  loading: "Loading your player profile.",
  loadFailed: "Could not load your player profile. Try again.",
  missingTagTitle: "Pick a gamer tag",
  missingTag:
    "Other players see your gamer tag instead of your email. Pick one to finish your player card.",
  tagSaved: "Gamer tag saved. Games use it the next time you sit down.",
  avatarSaved: "Avatar saved.",
  saving: "Saving…",
} as const;

const SAVE_ERRORS: Record<Exclude<ProfileErrorCode, "taken" | "invalid">, string> = {
  conflict: "Your profile changed somewhere else. Reload the page and try again.",
  unauthorized: "Your session expired. Sign in again to save changes.",
  unavailable: "Could not save right now. Try again.",
};

export function profileSaveError(code: ProfileErrorCode): string {
  return code === "taken" || code === "invalid" ? SAVE_ERRORS.unavailable : SAVE_ERRORS[code];
}
