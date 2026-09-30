import { FeaturedMarquee } from "@/components/FeaturedMarquee";
import { GameLibrary } from "@/components/GameLibrary";
import { HouseRules } from "@/components/HouseRules";
import { LibraryRail } from "@/components/LibraryRail";
import { PlayerCard } from "@/components/PlayerCard";
import { Frame, HudLabel } from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";
import { StudioStory } from "@/components/StudioStory";

export default function Home() {
  return (
    <SiteShell current="library">
      <Frame className="grid gap-6 pt-6 lg:grid-cols-[theme(spacing.rail)_minmax(0,1fr)] lg:gap-10 lg:pt-10">
        <LibraryRail />

        <div className="flex min-w-0 flex-col gap-section">
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
              <HudLabel tone="cyan">Galaxy Class Gaming · Arcade</HudLabel>
              <h1 className="text-balance font-display text-marquee uppercase">
                Games worth{" "}
                <span className="text-pink [text-shadow:0_0_24px_rgb(var(--c-pink)/0.45)]">
                  sitting down for.
                </span>
              </h1>
              <p className="max-w-[60ch] text-body-l text-ink-muted">
                Online games for strangers, friends, and family. Pick a
                cabinet and play in your browser — no account needed.
              </p>
            </header>

            <FeaturedMarquee />
          </div>

          <GameLibrary />
          <HouseRules />
          <StudioStory />
          <PlayerCard />
        </div>
      </Frame>
    </SiteShell>
  );
}
