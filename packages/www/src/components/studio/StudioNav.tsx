"use client";

import { useEffect, useState } from "react";
import type { NavSection } from "@/components/Nav";
import { Avatar } from "@/components/profile/Avatar";
import { STUDIO_LINKS, STUDIO_NAV_LINKS } from "@/content/site";
import { playerLabel, useSession } from "@/lib/auth/session";
import { Player } from "./icons";
import { Wordmark } from "./Wordmark";
import { gcButtonClass } from "./ui";

/** Past this scroll offset the overlay nav turns solid. */
const SOLID_AFTER = 24;

function useScrolled(enabled: boolean): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const update = () => setScrolled(window.scrollY > SOLID_AFTER);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [enabled]);

  return scrolled;
}

const linkClass =
  "group relative inline-flex min-h-11 items-center gap-2 px-1 font-gc-sans text-gc-small font-medium text-gc-ink-2 transition-colors duration-gc-2 hover:text-gc-ink";

/** Fixed top bar for the studio theme. `overlay` floats it over the hero until the page scrolls. */
export function StudioNav({ current, overlay = false }: { current?: NavSection; overlay?: boolean }) {
  const session = useSession();
  const scrolled = useScrolled(overlay);
  const solid = !overlay || scrolled;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-gc-nav h-[var(--gc-nav-h)] border-b transition-[background-color,border-color,backdrop-filter] duration-gc-3 ease-gc-out ${
        solid
          ? "border-gc-rule bg-gc-void/70 backdrop-blur-xl"
          : "border-transparent bg-transparent"
      }`}
    >
      {overlay ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgb(5_6_10/0.7)] to-transparent transition-opacity duration-gc-3 ${
            solid ? "opacity-0" : "opacity-100"
          }`}
        />
      ) : null}
      <nav
        aria-label="Main"
        className="relative mx-auto flex h-full w-full max-w-gc-frame items-center justify-between gap-4 px-gc-gutter"
      >
        <div className="flex items-center gap-10">
          <Wordmark />
          <ul className="hidden items-center gap-6 md:flex">
            {STUDIO_NAV_LINKS.map((link) => {
              const active = link.section !== null && link.section === current;
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`${linkClass} ${active ? "text-gc-ink" : ""} after:absolute after:inset-x-1 after:bottom-1.5 after:origin-left after:transition-transform after:duration-gc-2 after:ease-gc-out ${
                      active
                        ? "after:h-0.5 after:scale-x-100 after:bg-gc-stellar after:shadow-gc-glow-stellar"
                        : "after:h-px after:scale-x-0 after:bg-gc-ink hover:after:scale-x-100"
                    }`}
                  >
                    <span aria-hidden="true" className="font-gc-mono text-gc-mono-s text-gc-ink-3">
                      {link.index}
                    </span>
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {session.status === "loading" ? (
            <div className="h-10 w-28 border border-dashed border-gc-rule" aria-hidden="true" />
          ) : session.status === "signed-in" ? (
            <>
              <a
                href={STUDIO_LINKS.account}
                aria-label={`Signed in as ${playerLabel(session.profile)}`}
                aria-current={current === "account" ? "page" : undefined}
                className="inline-flex min-h-11 max-w-[14rem] items-center gap-2 px-1.5 font-gc-mono text-gc-small font-medium text-gc-ink transition-colors duration-gc-2 hover:text-gc-stellar"
              >
                {session.profile ? (
                  <Avatar
                    avatarId={session.profile.avatarId}
                    size="sm"
                    className="!border-gc-rule-2 !shadow-none"
                  />
                ) : (
                  <span className="flex size-8 items-center justify-center border border-gc-rule-2 text-gc-ink-2">
                    <Player className="size-5" />
                  </span>
                )}
                <span className="truncate max-sm:sr-only">{playerLabel(session.profile)}</span>
              </a>
              <button
                type="button"
                onClick={() => void session.signOut()}
                className={gcButtonClass("ghost", "md", "max-md:hidden")}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a href={STUDIO_LINKS.signIn} className={gcButtonClass("ghost", "md", "max-md:hidden")}>
                Sign in
              </a>
              <a href={STUDIO_LINKS.signUp} className={gcButtonClass("solar", "md", "max-sm:px-4")}>
                Sign up
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
