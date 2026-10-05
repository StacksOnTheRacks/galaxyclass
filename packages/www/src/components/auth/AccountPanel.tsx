"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HudLabel } from "@/components/primitives";
import { Avatar } from "@/components/profile/Avatar";
import { MemberCard } from "@/components/profile/MemberCard";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { GamerTagForm } from "@/components/profile/GamerTagForm";
import { useSession } from "@/lib/auth/session";
import { PROFILE_COPY } from "@/lib/profile/messages";
import { AuthScreen, FormAlert, TextAction } from "./ui";

function SectionHeading({ id, kicker, children }: { id: string; kicker: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <HudLabel tone="pink" as="span">
        {kicker}
      </HudLabel>
      <h2 id={id} className="font-display text-heading uppercase text-ink">
        {children}
      </h2>
    </div>
  );
}

export function AccountPanel() {
  const router = useRouter();
  const session = useSession();
  const { profile, profileStatus } = session;

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
          <div className="flex items-center gap-4">
            {profile ? (
              <Avatar avatarId={profile.avatarId} size="md" />
            ) : (
              <span
                aria-hidden="true"
                className="size-16 shrink-0 rounded-md border-2 border-dashed border-bezel"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <HudLabel tone="muted">Gamer tag</HudLabel>
              <p className="truncate text-heading font-semibold text-ink">
                {profile?.gamerTag ?? (profileStatus === "ready" ? "Not set yet" : "—")}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-bezel pt-3">
            <HudLabel tone="muted">Signed in as</HudLabel>
            {session.email ? (
              <p className="break-all text-small text-ink-muted">{session.email}</p>
            ) : null}
          </div>
          <p className="flex items-center gap-2 text-small text-ink-muted">
            <span aria-hidden="true" className="text-success">
              ●
            </span>
            Galaxy Class identity across games
          </p>
        </div>
        <MemberCard
          className="max-sm:hidden"
          gamerTag={profile?.gamerTag ?? undefined}
          avatarId={profile?.avatarId}
        />
      </div>

      {profileStatus === "loading" || profileStatus === "idle" ? (
        <p role="status" className="text-small text-ink-muted">
          {PROFILE_COPY.loading}
        </p>
      ) : null}

      {profileStatus === "error" ? (
        <div className="flex flex-col gap-3">
          <FormAlert>{PROFILE_COPY.loadFailed}</FormAlert>
          <TextAction variant="secondary" onClick={() => void session.reloadProfile()}>
            Try again
          </TextAction>
        </div>
      ) : null}

      {profile && profileStatus === "ready" ? (
        <>
          {profile.gamerTag ? null : (
            <div className="flex items-start gap-3 rounded-md border-2 border-amber/70 bg-amber/10 px-4 py-3">
              <span aria-hidden="true" className="font-display text-[13px] text-amber">
                ▶
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-ink">{PROFILE_COPY.missingTagTitle}</p>
                <p className="text-small text-ink">{PROFILE_COPY.missingTag}</p>
              </div>
            </div>
          )}

          <section
            aria-labelledby="account-gamer-tag-heading"
            className="flex flex-col gap-5 border-t border-bezel pt-5"
          >
            <SectionHeading id="account-gamer-tag-heading" kicker="Shown in every room">
              Your gamer tag
            </SectionHeading>
            <GamerTagForm profile={profile} onSaved={session.setProfile} />
          </section>

          <section
            aria-labelledby="account-avatar-heading"
            className="flex flex-col gap-5 border-t border-bezel pt-5"
          >
            <SectionHeading id="account-avatar-heading" kicker="Shown beside your tag">
              Your avatar
            </SectionHeading>
            <AvatarPicker profile={profile} onSaved={session.setProfile} />
          </section>
        </>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-bezel pt-5 sm:flex-row sm:items-center sm:justify-end">
        <TextAction variant="secondary" onClick={() => void session.signOut()}>
          Sign out
        </TextAction>
      </div>
    </AuthScreen>
  );
}
