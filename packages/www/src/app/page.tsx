import { ARCADE_HREF, ButtonLink, Frame, HudLabel, buttonClass } from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";

const APHELION_HREF = "https://aphelionrun.com";

const aphelionFacts = [
  { term: "Setting", detail: "Sol, on a real local star map" },
  { term: "Work", detail: "Mine, siphon, haul, sell" },
  { term: "Risk", detail: "Fights in orbit" },
  { term: "Plays in", detail: "Your browser" },
];

const arcadeGames = ["Riffle Poker", "Scribble", "Warships", "Whodunit?"];

function OrbitArt({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 400"
      fill="none"
      className={className}
    >
      <defs>
        <radialGradient id="sun-glow">
          <stop offset="0" stopColor="rgb(var(--c-accent))" stopOpacity="0.55" />
          <stop offset="1" stopColor="rgb(var(--c-accent))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="rgb(var(--c-ink))" strokeOpacity="0.14">
        <circle cx="200" cy="200" r="70" />
        <circle cx="200" cy="200" r="118" />
        <circle cx="200" cy="200" r="168" strokeDasharray="2 7" />
      </g>
      <path
        d="M270 200 A118 118 0 0 1 116 283"
        stroke="rgb(var(--c-accent))"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeDasharray="5 6"
      />
      <circle cx="200" cy="200" r="64" fill="url(#sun-glow)" />
      <circle cx="200" cy="200" r="16" fill="rgb(var(--c-accent))" />
      <circle cx="270" cy="200" r="5" fill="rgb(var(--c-ink))" fillOpacity="0.8" />
      <circle cx="116" cy="283" r="7" fill="rgb(var(--c-ink))" fillOpacity="0.55" />
      <circle cx="128" cy="292" r="2.5" fill="rgb(var(--c-ink))" fillOpacity="0.45" />
      <circle cx="330" cy="110" r="4" fill="rgb(var(--c-ink))" fillOpacity="0.35" />
    </svg>
  );
}

export default function Home() {
  return (
    <SiteShell>
      <Frame className="flex flex-col gap-14 pt-10 md:gap-20 md:pt-20">
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

        <section
          aria-labelledby="aphelion-heading"
          className="panel grid overflow-hidden lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
        >
          <div className="flex flex-col gap-6 p-6 sm:p-10">
            <HudLabel tone="mark">Now playing</HudLabel>
            <h2
              id="aphelion-heading"
              className="font-display text-[clamp(2rem,1.2rem+2vw,3.25rem)] font-medium leading-none tracking-[-0.02em]"
            >
              Aphelion Run
            </h2>
            <p className="max-w-[46ch] text-body-l text-ink-muted">
              Fly a ship out of your home base in Sol. Mine moons, siphon the
              Sun’s collectors, sell energy on Earth’s black market, and fight
              for what you haul.
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-bezel pt-5">
              {aphelionFacts.map((fact) => (
                <div key={fact.term} className="flex flex-col gap-1">
                  <dt className="font-hud text-hud uppercase tracking-[0.18em] text-ink-muted">
                    {fact.term}
                  </dt>
                  <dd className="text-small font-semibold text-ink">{fact.detail}</dd>
                </div>
              ))}
            </dl>
            <a
              href={APHELION_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("primary", "lg", "self-start max-sm:w-full")}
            >
              Play Aphelion Run
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <div className="relative flex items-center justify-center border-bezel bg-void/60 p-6 max-lg:border-t lg:border-l">
            <OrbitArt className="w-full max-w-[22rem]" />
          </div>
        </section>

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
