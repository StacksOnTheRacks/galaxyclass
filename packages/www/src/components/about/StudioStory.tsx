import { HudLabel } from "../primitives";

const sheet = [
  { term: "Makes", detail: "Online multiplayer games" },
  { term: "Plays in", detail: "Your browser, phone or desktop" },
  { term: "Chips", detail: "Social only — nothing to buy" },
  { term: "Rooms open", detail: "Riffle Poker, Scribble, Warships" },
];

export function StudioStory() {
  return (
    <section
      id="studio"
      aria-labelledby="studio-heading"
      className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-10"
    >
      <div className="flex flex-col gap-3">
        <HudLabel tone="cyan">The studio</HudLabel>
        <h2 id="studio-heading" className="font-display text-title uppercase">
          Who we are
        </h2>
        <div className="flex max-w-[62ch] flex-col gap-4 text-ink-muted md:text-body-l">
          <p>
            Galaxy Class Gaming is an independent studio making online games
            you can play with strangers, or with friends and family.
          </p>
          <p>
            We build for the table, not the wallet: games run in the browser,
            play uses social chips, and there is nothing to buy. Each game is its
            own room with its own name and look — Riffle Poker, Scribble, and
            Warships are open now, and more are on the way.
          </p>
        </div>
      </div>

      <dl className="panel flex flex-col divide-y divide-bezel px-5 py-2">
        {sheet.map((row) => (
          <div key={row.term} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="font-hud text-hud uppercase text-ink-muted">{row.term}</dt>
            <dd className="text-right font-semibold text-ink">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
