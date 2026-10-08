"use client";

import { playerLabel, useSession } from "@/lib/auth/session";
import { PlayerIcon } from "../icons";
import { ACCOUNT_HREF, ButtonLink, SIGN_IN_HREF, SIGN_UP_HREF } from "../primitives";
import { Avatar } from "../profile/Avatar";

export function AccountPrompt() {
  const session = useSession();

  if (session.status === "loading") {
    return null;
  }

  const signedIn = session.status === "signed-in";

  return (
    <section
      aria-labelledby="account-prompt-heading"
      className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-center gap-4">
        {signedIn && session.profile ? (
          <Avatar avatarId={session.profile.avatarId} size="md" className="max-sm:size-12" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-bezel-hi text-ink-muted sm:size-16">
            <PlayerIcon className="size-7" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="account-prompt-heading" className="text-heading font-semibold text-ink">
            {signedIn ? `Playing as ${playerLabel(session.profile)}` : "Playing as a guest"}
          </h2>
          <p className="text-small text-ink-muted">
            {signedIn
              ? "Your gamer tag and avatar follow you into every room."
              : "No account needed for Riffle Poker. Sign up free to play Scribble, Warships, and Whodunit?, and bring your gamer tag and avatar into every room."}
          </p>
        </div>
      </div>

      {signedIn ? (
        <ButtonLink href={ACCOUNT_HREF} variant="secondary" className="shrink-0">
          Account
        </ButtonLink>
      ) : (
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <ButtonLink href={SIGN_UP_HREF}>Sign up</ButtonLink>
          <ButtonLink href={SIGN_IN_HREF} variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
