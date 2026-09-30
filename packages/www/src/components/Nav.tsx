"use client";

import { playerLabel, useSession } from "@/lib/auth/session";
import { Avatar } from "./profile/Avatar";
import {
  ACCOUNT_HREF,
  ButtonLink,
  buttonClass,
  Frame,
  LIBRARY_HREF,
  Logo,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
  STUDIO_HREF,
} from "./primitives";

export type NavSection = "library" | "studio" | "account";

const tabs: { href: string; label: string; section: NavSection }[] = [
  { href: LIBRARY_HREF, label: "Library", section: "library" },
  { href: STUDIO_HREF, label: "Studio", section: "studio" },
];

function Tabs({ current, className }: { current?: NavSection; className: string }) {
  return (
    <ul className={className}>
      {tabs.map((tab) => {
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
  const signedIn = session.status === "signed-in";

  return (
    <header className="sticky top-0 z-40 border-b border-bezel bg-void/95">
      <Frame>
        <nav aria-label="Main" className="flex flex-col">
          <div className="flex h-16 items-center justify-between gap-4 lg:h-[76px]">
            <div className="flex items-center gap-8">
              <Logo />
              <Tabs current={current} className="hidden items-center gap-1 md:flex" />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {session.status === "loading" ? (
                <div
                  className="h-11 w-36 rounded-md border border-dashed border-bezel"
                  aria-hidden="true"
                />
              ) : signedIn ? (
                <>
                  <span
                    className="hidden max-w-[18rem] items-center gap-2 text-small text-ink-muted xl:inline-flex"
                  >
                    {session.profile ? (
                      <Avatar avatarId={session.profile.avatarId} size="sm" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="rounded-sm bg-cyan px-1.5 py-0.5 font-hud text-hud text-void"
                      >
                        P1
                      </span>
                    )}
                    <span className="truncate">Signed in as {playerLabel(session.profile)}</span>
                  </span>
                  <ButtonLink
                    href={ACCOUNT_HREF}
                    variant="secondary"
                    className="max-sm:px-2.5 max-sm:text-[13px]"
                  >
                    Account
                  </ButtonLink>
                  <button
                    type="button"
                    onClick={() => void session.signOut()}
                    className={buttonClass("ghost", "md", "px-1 max-sm:text-[13px] sm:px-3")}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={SIGN_IN_HREF}
                    className={buttonClass("ghost", "md", "px-1 max-sm:text-[13px] sm:px-3")}
                  >
                    Sign in
                  </a>
                  <ButtonLink href={SIGN_UP_HREF} className="max-sm:px-2.5 max-sm:text-[13px]">
                    Sign up
                  </ButtonLink>
                </>
              )}
            </div>
          </div>

          <Tabs
            current={current}
            className="-mx-3 flex items-center gap-1 border-t border-bezel/60 md:hidden"
          />
        </nav>
      </Frame>
    </header>
  );
}
