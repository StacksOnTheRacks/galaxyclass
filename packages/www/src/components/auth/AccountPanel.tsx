"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { AuthScreen, TextAction } from "./ui";

export function AccountPanel() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.status === "signed-out") {
      router.replace("/sign-in?next=/account");
    }
  }, [router, session.status]);

  if (session.status !== "signed-in") {
    return (
      <AuthScreen
        title="Your Galaxy Class account"
        width="account"
        subtitle={
          session.status === "loading" ? (
            <p role="status">Checking your session.</p>
          ) : undefined
        }
      />
    );
  }

  return (
    <AuthScreen title="Your Galaxy Class account" width="account">
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-6 text-left">
        {session.email ? <p className="text-body-m text-fg">{session.email}</p> : null}
        <p className="text-[13px] leading-5 text-fg-muted">
          Galaxy Class identity across games
        </p>
      </div>
      <TextAction onClick={() => void session.signOut()}>Sign out</TextAction>
    </AuthScreen>
  );
}
