import { AphelionFeature } from "@/components/aphelion/AphelionFeature";
import { ARCADE_HREF, ButtonLink, Frame, HudLabel } from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";

const arcadeGames = ["Riffle Poker", "Scribble", "Warships", "Whodunit?"];

export default function Home() {
  return (
    <SiteShell overlayNav>
      <Frame className="pt-[calc(var(--gc-nav-h)+2.5rem)] pb-14 md:pb-20">
        <header className="flex max-w-[44rem] flex-col gap-5">
          <HudLabel tone="mark">Independent game studio</HudLabel>
          <h1 className="font-display text-[clamp(2.5rem,1.4rem+3.4vw,4.25rem)] font-medium leading-[1.05] tracking-[-0.02em] text-ink [text-wrap:balance]">
            Deep games you can open in a tab.
          </h1>
          <p className="max-w-[46ch] text-body-l text-ink-muted">
            Galaxy Class builds original games with real systems to learn and
            worlds to work in. No install. First up: Aphelion Run.
          </p>
        </header>
      </Frame>

      <AphelionFeature />

      <Frame className="py-14 md:py-20">
        <section
          aria-labelledby="arcade-heading"
          className="flex flex-col gap-5 border-t border-bezel pt-10 md:flex-row md:items-end md:justify-between md:gap-10"
        >
          <div className="flex max-w-[40rem] flex-col gap-3">
            <HudLabel tone="muted">The Arcade</HudLabel>
            <h2 id="arcade-heading" className="font-display text-title font-medium">
              Quick games, still open
            </h2>
            <p className="max-w-[46ch] text-ink-muted">
              Our first games are small table games for friends and strangers.
              They live on in The Arcade.
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
