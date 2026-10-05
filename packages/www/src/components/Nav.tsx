"use client";

import { playerLabel, useSession } from "@/lib/auth/session";
import { Avatar } from "./profile/Avatar";
import { PlayerIcon } from "./icons";
import {
  ABOUT_HREF,
  ACCOUNT_HREF,
  ButtonLink,
  buttonClass,
  Frame,
  Logo,
  ROOMS_HREF,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
} from "./primitives";

export type NavSection = "rooms" | "about" | "account";

export const sections: { href: string; label: string; section: NavSection }[] = [
  { href: ROOMS_HREF, label: "Rooms", section: "rooms" },
  { href: ABOUT_HREF, label: "About", section: "about" },
];

function Tabs({ current }: { current?: NavSection }) {
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {sections.map((tab) => {
        const active = tab.section === current;
        return (
          <li key={tab.href}>
            <a
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative inline-flex min-h-11 items-center px-3 font-display text-[14px] uppercase tracking-wider transition duration-quick hover:text-ink ${
                active
                  ? "text-ink after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:rounded-full after:bg-cyan after:shadow-glow-cyan"
                  : "text-ink-muted"
              }`}
            >
              {tab.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function Nav({ current }: { current?: NavSection }) {
  const session = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-bezel bg-void/90 backdrop-blur-md">
      <Frame>
        <nav aria-label="Main" className="flex h-14 items-center justify-between gap-4 md:h-16">
          <div className="flex items-center gap-8">
            <Logo />
            <Tabs current={current} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {session.status === "loading" ? (
              <div
                className="h-10 w-28 rounded-md border border-dashed border-bezel"
                aria-hidden="true"
              />
            ) : session.status === "signed-in" ? (
              <>
                <a
                  href={ACCOUNT_HREF}
                  aria-label={`Signed in as ${playerLabel(session.profile)}`}
                  aria-current={current === "account" ? "page" : undefined}
                  className="inline-flex min-h-11 max-w-[14rem] items-center gap-2 rounded-md px-1.5 text-small font-semibold text-ink transition duration-quick hover:text-cyan"
                >
                  {session.profile ? (
                    <Avatar avatarId={session.profile.avatarId} size="sm" />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-sm border border-bezel-hi text-ink-muted">
                      <PlayerIcon className="size-5" />
                    </span>
                  )}
                  <span className="truncate max-sm:sr-only">{playerLabel(session.profile)}</span>
                </a>
                <button
                  type="button"
                  onClick={() => void session.signOut()}
                  className={buttonClass("ghost", "md", "px-3 max-md:hidden")}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a
                  href={SIGN_IN_HREF}
                  className={buttonClass("ghost", "md", "px-3 max-md:hidden")}
                >
                  Sign in
                </a>
                <ButtonLink href={SIGN_UP_HREF} className="max-sm:min-h-10 max-sm:px-4">
                  Sign up
                </ButtonLink>
              </>
            )}
          </div>
        </nav>
      </Frame>
    </header>
  );
}
