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
import { authResources, withAuth } from "./api";

type Status = "loading" | "signed-out" | "signed-in";

type SessionValue = {
  status: Status;
  email: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const signedOutValue: SessionValue = {
  status: "signed-out",
  email: "",
  refresh: async () => {},
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() =>
    authResources() ? "loading" : "signed-out",
  );
  const [email, setEmail] = useState("");

  const refresh = useCallback(async () => {
    if (!authResources()) {
      setStatus("signed-out");
      setEmail("");
      return;
    }

    try {
      const nextEmail = await readSignedInEmail();
      setEmail(nextEmail);
      setStatus("signed-in");
    } catch {
      setEmail("");
      setStatus("signed-out");
    }
  }, []);

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
    setEmail("");
    setStatus("signed-out");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, email, refresh, signOut }),
    [status, email, refresh, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
