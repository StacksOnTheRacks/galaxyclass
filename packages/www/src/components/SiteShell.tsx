import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav, type NavSection } from "./Nav";
import { TabBar } from "./TabBar";

export function SiteShell({
  children,
  current,
}: {
  children: ReactNode;
  current?: NavSection;
}) {
  return (
    <div className="app-backdrop relative isolate flex min-h-screen flex-col pb-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom))] md:pb-0">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-cyan px-4 py-2 font-display text-void focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Nav current={current} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <TabBar current={current} />
    </div>
  );
}
