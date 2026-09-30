import type { CSSProperties } from "react";
import { MarqueeStrip } from "./Marquee";
import { ButtonLink, HudLabel, PLAY_RIFFLE_HREF, StatusTag } from "./primitives";
import { RiffleScreen, RiffleWordmark } from "./RiffleScreen";

const specs = [
  { term: "Game", detail: "No-limit Texas Hold’em" },
  { term: "Players", detail: "Strangers, friends, or family" },
  { term: "Chips", detail: "Social chips — nothing to buy" },
  { term: "Account", detail: "Not needed to play" },
];

export function FeaturedMarquee() {
  return (
    <section
      id="featured"
      aria-labelledby="featured-heading"
      className="cabinet t-molding"
      style={{ "--molding": "rgb(var(--c-riffle))" } as CSSProperties}
    >
      <div className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-5">
        <MarqueeStrip>
          <HudLabel tone="amber">★ Featured game</HudLabel>
          <HudLabel tone="muted">Cabinet 01</HudLabel>
        </MarqueeStrip>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-7">
          <RiffleScreen className="aspect-[4/3] w-full sm:aspect-[16/11]" />

          <div className="flex flex-col items-start gap-5 px-1 pb-2 lg:py-2">
            <StatusTag status="live" />
            <h2 id="featured-heading" className="leading-none">
              <span className="sr-only">Riffle Poker</span>
              <RiffleWordmark className="text-[40px] sm:text-[56px]" />
            </h2>
            <p className="text-body-l text-ink-muted">
              No-limit Texas Hold&rsquo;em in your browser. Sit down with
              strangers, or send a link to friends and family.
            </p>

            <dl className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-md border border-bezel bg-bezel">
              {specs.map((spec) => (
                <div key={spec.term} className="flex flex-col gap-1 bg-floor px-3 py-3">
                  <dt>
                    <HudLabel as="span" tone="muted">
                      {spec.term}
                    </HudLabel>
                  </dt>
                  <dd className="text-small font-semibold text-ink">{spec.detail}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-auto flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={PLAY_RIFFLE_HREF} size="lg" arrow>
                Play Riffle Poker
              </ButtonLink>
              <p className="text-small text-ink-muted">
                Opens galaxyclass.app/riffle. No account needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
