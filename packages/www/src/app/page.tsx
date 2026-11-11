import { AphelionFeature } from "@/components/aphelion/AphelionFeature";
import { ARCADE_HREF, ButtonLink, Frame, HudLabel } from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";

const arcadeGames = ["Riffle Poker", "Scribble", "Warships", "Whodunit?"];

export default function Home() {
  return (
    <SiteShell overlayNav>
      <AphelionFeature />

      <Frame className="py-14 md:py-20">
        <section
          aria-labelledby="arcade-heading"
          className="flex flex-col gap-5 border-t border-bezel pt-10 md:flex-row md:items-end md:justify-between md:gap-10"
        >
          <div className="flex max-w-[40rem] flex-col gap-3">
            <HudLabel tone="muted">The Arcade</HudLabel>
            <h2 id="arcade-heading" className="font-display text-title font-medium">
              Online board and table games, always open
            </h2>
            <p className="max-w-[46ch] text-ink-muted">
              A growing library of online board and table games to play with
              friends or jump in with strangers. Pick a game, grab a seat, and
              play in your browser.
            </p>
            <ul aria-label="Arcade games" className="flex flex-wrap gap-2 pt-1">
              {arcadeGames.map((game) => (
                <li
                  key={game}
                  className="rounded-full border border-bezel px-3 py-1 text-small text-ink-muted"
                >
                  {game}
                </li>
              ))}
            </ul>
          </div>
          <ButtonLink href={ARCADE_HREF} variant="secondary" arrow className="shrink-0 max-sm:w-full">
            Enter The Arcade
          </ButtonLink>
        </section>
      </Frame>
    </SiteShell>
  );
}
