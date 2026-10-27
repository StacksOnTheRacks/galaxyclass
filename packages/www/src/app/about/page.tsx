import type { Metadata } from "next";
import { StudioStory } from "@/components/about/StudioStory";
import { ARCADE_HREF, ButtonLink, Frame, HudLabel, buttonClass } from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";

const APHELION_HREF = "https://aphelionrun.com";

export const metadata: Metadata = {
  title: "About — Galaxy Class",
  description:
    "Galaxy Class makes larger original games, starting with Aphelion Run. The Arcade holds Riffle Poker, Scribble, Warships, and Whodunit?.",
};

export default function About() {
  return (
    <SiteShell current="about">
      <Frame className="flex flex-col gap-14 pt-10 md:gap-20 md:pt-16">
        <header className="flex max-w-[40rem] flex-col gap-4">
          <HudLabel tone="mark">About</HudLabel>
          <h1 className="font-display text-[clamp(2.5rem,1.4rem+3vw,4rem)] font-medium leading-[1.05] tracking-[-0.02em]">
            Galaxy Class
          </h1>
          <p className="max-w-[48ch] text-ink-muted md:text-body-l">
            An independent studio making larger original games, and a smaller
            arcade you can play in the browser.
          </p>
        </header>

        <StudioStory />

        <section aria-labelledby="about-aphelion" className="flex max-w-[40rem] flex-col gap-4">
          <HudLabel tone="mark">Now</HudLabel>
          <h2 id="about-aphelion" className="font-display text-title font-medium">
            Aphelion Run
          </h2>
          <p className="max-w-[52ch] text-ink-muted md:text-body-l">
            The first large game from Galaxy Class: a solar-system game of ships,
            orbits, and the long run between worlds.
          </p>
          <a
            href={APHELION_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("primary", "lg", "self-start max-sm:w-full")}
          >
            Play Aphelion Run
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>

        <section aria-labelledby="about-arcade" className="flex max-w-[40rem] flex-col gap-4">
          <HudLabel tone="muted">The Arcade</HudLabel>
          <h2 id="about-arcade" className="font-display text-title font-medium">
            Smaller games, still open
          </h2>
          <p className="max-w-[52ch] text-ink-muted md:text-body-l">
            Riffle Poker, Scribble, Warships, and Whodunit? stay up in The Arcade.
            Social chips only — nothing to buy.
          </p>
          <ButtonLink href={ARCADE_HREF} variant="secondary" arrow className="self-start max-sm:w-full">
            The Arcade
          </ButtonLink>
        </section>
      </Frame>
    </SiteShell>
  );
}
