import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav, type NavSection } from "./Nav";
import { MotionProvider } from "./studio/motion";
import { StudioFooter } from "./studio/StudioFooter";
import { StudioNav } from "./studio/StudioNav";
import { TabBar } from "./TabBar";

export type SiteTheme = "studio" | "arcade";

export function SiteShell({
  children,
  current,
  theme = "studio",
  overlayNav = false,
}: {
  children: ReactNode;
  current?: NavSection;
  theme?: SiteTheme;
  /** Studio theme only: float the nav over the first section (home). */
  overlayNav?: boolean;
}) {
  // The Arcade renders exactly what it always has. Do not restyle this branch:
  // src/test/arcade-guard.test.tsx snapshots its markup.
  if (theme === "arcade") {
    return (
      <div
        className="app-backdrop relative isolate flex min-h-screen flex-col pb-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom))] font-body md:pb-0 arcade"
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

  return (
    <div className="studio gc-shell relative isolate flex min-h-screen flex-col pb-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom))] font-body text-ink md:pb-0">
      <MotionProvider>
        <a
          href="#main"
          className="sr-only z-gc-nav rounded-gc-sm bg-gc-stellar px-4 py-2 font-gc-display text-gc-void focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <StudioNav current={current} overlay={overlayNav} />
        <main id="main" className={overlayNav ? "flex-1" : "flex-1 pt-gc-nav"}>
          {children}
        </main>
        <StudioFooter />
        <TabBar current={current} />
        <div className="gc-grain" aria-hidden="true" />
      </MotionProvider>
    </div>
  );
}
