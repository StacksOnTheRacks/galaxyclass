"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { AboutIcon, PlayerIcon, RoomsIcon } from "./icons";
import type { NavSection } from "./Nav";
import { ABOUT_HREF, ACCOUNT_HREF, ROOMS_HREF, SIGN_IN_HREF } from "./primitives";
import { Avatar } from "./profile/Avatar";

function Tab({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <li className="flex">
      <a
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition duration-quick focus-visible:outline-offset-[-4px] ${
          active
            ? "text-ink before:absolute before:inset-x-6 before:top-0 before:h-[3px] before:rounded-b-full before:bg-cyan before:shadow-glow-cyan"
            : "text-ink-muted hover:text-ink"
        }`}
      >
        <span className={active ? "text-cyan" : undefined}>{icon}</span>
        {label}
      </a>
    </li>
  );
}

/** Phone-only bottom navigation; the top bar carries these sections from md up. */
export function TabBar({ current }: { current?: NavSection }) {
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const avatarId = signedIn ? session.profile?.avatarId : undefined;

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-bezel bg-void/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid h-tabbar max-w-md grid-cols-3">
        <Tab href={ROOMS_HREF} label="Rooms" active={current === "rooms"} icon={<RoomsIcon />} />
        <Tab href={ABOUT_HREF} label="About" active={current === "about"} icon={<AboutIcon />} />
        <Tab
          href={signedIn || session.status === "loading" ? ACCOUNT_HREF : SIGN_IN_HREF}
          label={signedIn || session.status === "loading" ? "Account" : "Sign in"}
          active={current === "account"}
          icon={
            avatarId ? (
              <Avatar avatarId={avatarId} size="sm" className="!size-6 !shadow-none" />
            ) : (
              <PlayerIcon />
            )
          }
        />
      </ul>
    </nav>
  );
}
