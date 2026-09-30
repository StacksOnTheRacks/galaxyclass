"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchProfile, type Profile } from "@/lib/profile/api";
import { ACCOUNT_HINT_KEY, clearAccountHint, writeAccountHint } from "./account-hint";
import { authResources, withAuth } from "./api";

type Status = "loading" | "signed-out" | "signed-in";
export type ProfileStatus = "idle" | "loading" | "ready" | "error";

type SessionValue = {
  status: Status;
  email: string;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  refresh: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
};

const signedOutValue: SessionValue = {
  status: "signed-out",
  email: "",
  profile: null,
  profileStatus: "idle",
  refresh: async () => {},
  reloadProfile: async () => {},
  setProfile: () => {},
  signOut: async () => {},
};

const SessionContext = createContext<SessionValue>(signedOutValue);

async function readSignedInEmail(): Promise<string> {
  return withAuth(async (auth) => {
    await auth.getCurrentUser();
    const attributes = await auth.fetchUserAttributes();
    return attributes.email ?? "";
  });
}

function hasAccountHint(): boolean {
  try {
    return window.localStorage.getItem(ACCOUNT_HINT_KEY) !== null;
  } catch {
    return false;
  }
}

/** Public name for a signed-in player: their gamer tag, else a generic label (never email). */
export function playerLabel(profile: Profile | null): string {
  return profile?.gamerTag ?? "Player 1";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() =>
    authResources() ? "loading" : "signed-out",
  );
  const [email, setEmail] = useState("");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");

  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    setProfileStatus("ready");
    writeAccountHint(next);
  }, []);

  const reloadProfile = useCallback(async () => {
    setProfileStatus("loading");
    try {
      setProfile(await fetchProfile());
    } catch {
      setProfileStatus("error");
      // Keep a previously written hint so games still show the last known profile.
      if (!hasAccountHint()) {
        writeAccountHint({ gamerTag: null, avatarId: null });
      }
    }
  }, [setProfile]);

  const resetSignedOut = useCallback(() => {
    clearAccountHint();
    setEmail("");
    setProfileState(null);
    setProfileStatus("idle");
    setStatus("signed-out");
  }, []);

  const refresh = useCallback(async () => {
    if (!authResources()) {
      resetSignedOut();
      return;
    }

    let nextEmail: string;
    try {
      nextEmail = await readSignedInEmail();
    } catch {
      resetSignedOut();
      return;
    }
    setEmail(nextEmail);
    setStatus("signed-in");
    await reloadProfile();
  }, [reloadProfile, resetSignedOut]);

  const signOut = useCallback(async () => {
    if (authResources()) {
      try {
        await withAuth(async (auth) => {
          await auth.signOut();
        });
      } catch {
        // Local chrome still returns to signed-out.
      }
    }
    resetSignedOut();
  }, [resetSignedOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      status,
      email,
      profile,
      profileStatus,
      refresh,
      reloadProfile,
      setProfile,
      signOut,
    }),
    [status, email, profile, profileStatus, refresh, reloadProfile, setProfile, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
