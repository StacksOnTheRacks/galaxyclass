"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MemberCard } from "@/components/PlayerCard";
import { ButtonLink, HudLabel, PLAY_RIFFLE_HREF } from "@/components/primitives";
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
        kind="account"
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
    <AuthScreen kind="account" title="Your Galaxy Class account" width="account">
      <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-4 rounded-md border border-bezel bg-floor p-5">
          <div className="flex flex-col gap-1">
            <HudLabel tone="muted">Signed in as</HudLabel>
            {session.email ? (
              <p className="break-all text-heading font-semibold text-ink">{session.email}</p>
            ) : null}
          </div>
          <p className="flex items-center gap-2 text-small text-ink-muted">
            <span aria-hidden="true" className="text-success">
              ●
            </span>
            Galaxy Class identity across games
          </p>
        </div>
        <MemberCard className="max-sm:hidden" />
      </div>
      <div className="flex flex-col gap-3 border-t border-bezel pt-5 sm:flex-row sm:items-center sm:justify-between">
        <ButtonLink href={PLAY_RIFFLE_HREF} size="lg" arrow>
          Play Riffle
        </ButtonLink>
        <TextAction variant="secondary" onClick={() => void session.signOut()}>
          Sign out
        </TextAction>
      </div>
    </AuthScreen>
  );
}
