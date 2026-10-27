import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav, type NavSection } from "./Nav";
import { TabBar } from "./TabBar";

export type SiteTheme = "studio" | "arcade";

export function SiteShell({
  children,
  current,
  theme = "studio",
}: {
  children: ReactNode;
  current?: NavSection;
  theme?: SiteTheme;
}) {
  return (
    <div
      className={`app-backdrop relative isolate flex min-h-screen flex-col pb-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom))] font-body md:pb-0 ${
        theme === "arcade" ? "arcade" : ""
      }`}
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-mark px-4 py-2 font-display text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Nav current={current} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer theme={theme} />
      <TabBar current={current} />
    </div>
  );
}
