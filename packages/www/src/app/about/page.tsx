import type { Metadata } from "next";
import { HouseRules } from "@/components/about/HouseRules";
import { StudioStory } from "@/components/about/StudioStory";
import { ButtonLink, Frame, HudLabel, ROOMS_HREF } from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "About — Galaxy Class Gaming",
  description:
    "How Galaxy Class game rooms work, and the independent studio behind Riffle Poker, Scribble, Warships, and Whodunit?",
};

export default function About() {
  return (
    <SiteShell current="about">
      <Frame className="flex flex-col gap-10 pt-6 md:gap-14 md:pt-10">
        <header className="flex flex-col gap-2">
          <HudLabel tone="cyan">About</HudLabel>
          <h1 className="font-display text-display-l uppercase">Galaxy Class Gaming</h1>
          <p className="max-w-[56ch] text-ink-muted md:text-body-l">
            Game rooms for strangers, friends, and family. Pick a room, choose a
            table, and play.
          </p>
        </header>

        <HouseRules />
        <StudioStory />

        <div>
          <ButtonLink href={ROOMS_HREF} size="lg" arrow className="max-sm:w-full">
            Browse rooms
          </ButtonLink>
        </div>
      </Frame>
    </SiteShell>
  );
}
