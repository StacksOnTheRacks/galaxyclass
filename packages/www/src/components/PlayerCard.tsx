"use client";

import { useSession } from "@/lib/auth/session";
import { Avatar } from "./profile/Avatar";
import {
  ACCOUNT_HREF,
  ButtonLink,
  HudLabel,
  PLAY_RIFFLE_HREF,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
} from "./primitives";

export function MemberCard({
  gamerTag,
  avatarId,
  className = "",
}: {
  gamerTag?: string;
  avatarId?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-[1.586] w-full max-w-[22rem] overflow-hidden rounded-lg border-2 border-pink/70 bg-floor p-5 shadow-glow-pink ${className}`}
    >
      <div className="absolute inset-y-0 right-0 w-1/3 bg-[repeating-linear-gradient(135deg,rgb(var(--c-pink)/0.18)_0_10px,transparent_10px_20px)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[14px] text-ink">Galaxy Class</span>
          <span className="rounded-sm bg-cyan px-1.5 py-0.5 font-hud text-hud text-void">
            P1
          </span>
        </div>
        <div className="flex items-end gap-3">
          {avatarId ? <Avatar avatarId={avatarId} size="sm" /> : null}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-hud text-hud uppercase text-ink-muted">Player card</span>
            <span className="truncate font-hud text-[13px] text-ink">
              {gamerTag || "•••• •••• ••••"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerCard() {
  const session = useSession();
  const signedIn = session.status === "signed-in";

  return (
    <section
      id="player-card"
      aria-labelledby="player-card-heading"
      className="cabinet grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="flex flex-col gap-4">
        <HudLabel tone="pink">Galaxy Class account</HudLabel>
        <h2 id="player-card-heading" className="font-display text-title uppercase">
          {signedIn ? "Your player card" : "Get your player card"}
        </h2>
        {signedIn ? (
          <p className="max-w-[56ch] text-body-l text-ink-muted">
            Signed in{session.profile?.gamerTag ? ` as ${session.profile.gamerTag}` : ""}. Your
            account works across every Galaxy Class game.
          </p>
        ) : (
          <p className="max-w-[56ch] text-body-l text-ink-muted">
            Playing is open to everyone. A free Galaxy Class account adds
            private, invite-only games and follows you across every title.
          </p>
        )}
        {session.status === "loading" ? null : signedIn ? (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={PLAY_RIFFLE_HREF} arrow>
              Play Riffle
            </ButtonLink>
            <ButtonLink href={ACCOUNT_HREF} variant="secondary">
              Open account
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={SIGN_UP_HREF}>Create account</ButtonLink>
            <ButtonLink href={SIGN_IN_HREF} variant="secondary">
              I have an account
            </ButtonLink>
          </div>
        )}
      </div>
      <MemberCard
        gamerTag={signedIn ? (session.profile?.gamerTag ?? undefined) : undefined}
        avatarId={signedIn ? session.profile?.avatarId : undefined}
      />
    </section>
  );
}
