import {
  PROFILE_API_ROUTES,
  type GamerTagAvailability,
  type PublicProfile,
} from "@galaxyclass/accounts/profile-api-contract";
import type { GamerTagError } from "@galaxyclass/accounts/gamer-tag";
import { withAuth } from "@/lib/auth/api";

export type Profile = PublicProfile;

export type ProfileErrorCode =
  | "taken"
  | "invalid"
  | "conflict"
  | "unauthorized"
  | "unavailable";

export class ProfileApiError extends Error {
  constructor(
    readonly code: ProfileErrorCode,
    readonly reason?: GamerTagError,
  ) {
    super(`profile api: ${code}`);
    this.name = "ProfileApiError";
  }
}

/** Same-origin by default (CloudFront routes /api/* to the profile API). */
function apiUrl(path: string): string {
  const origin = process.env.NEXT_PUBLIC_PROFILE_API_ORIGIN ?? "";
  return `${origin.replace(/\/$/, "")}${path}`;
}

async function idToken(): Promise<string> {
  const token = await withAuth(async (auth) => {
    const session = await auth.fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? "";
  });
  if (!token) {
    throw new ProfileApiError("unauthorized");
  }
  return token;
}

async function send<T>(path: string, init: RequestInit = {}, authed = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) {
    headers.set("content-type", "application/json");
  }
  if (authed) {
    headers.set("authorization", `Bearer ${await idToken()}`);
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
  } catch {
    throw new ProfileApiError("unavailable");
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON bodies (for example a CDN error page) fall through to the status mapping.
  }

  if (response.ok) {
    return body as T;
  }
  if (response.status === 401) throw new ProfileApiError("unauthorized");
  if (body.error === "gamer_tag_taken") throw new ProfileApiError("taken");
  if (body.error === "invalid_gamer_tag") {
    throw new ProfileApiError("invalid", body.reason as GamerTagError);
  }
  if (body.error === "conflict") throw new ProfileApiError("conflict");
  throw new ProfileApiError("unavailable");
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    (profile.gamerTag === null || typeof profile.gamerTag === "string") &&
    typeof profile.avatarId === "number"
  );
}

async function expectProfile(promise: Promise<unknown>): Promise<Profile> {
  const value = await promise;
  if (!isProfile(value)) {
    throw new ProfileApiError("unavailable");
  }
  return value;
}

export function fetchProfile(): Promise<Profile> {
  return expectProfile(send(PROFILE_API_ROUTES.profile));
}

export function saveGamerTag(gamerTag: string): Promise<Profile> {
  return expectProfile(
    send(PROFILE_API_ROUTES.gamerTag, { method: "PUT", body: JSON.stringify({ gamerTag }) }),
  );
}

export function saveAvatar(avatarId: number): Promise<Profile> {
  return expectProfile(
    send(PROFILE_API_ROUTES.avatar, { method: "PUT", body: JSON.stringify({ avatarId }) }),
  );
}

/** Advisory only: the sign-up trigger and the profile API enforce uniqueness atomically. */
export async function checkGamerTag(gamerTag: string): Promise<GamerTagAvailability | null> {
  try {
    return await send<GamerTagAvailability>(
      `${PROFILE_API_ROUTES.gamerTagAvailability}/${encodeURIComponent(gamerTag)}`,
      {},
      false,
    );
  } catch {
    return null;
  }
}
