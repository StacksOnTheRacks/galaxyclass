import { HudLabel } from "../primitives";

const sheet = [
  { term: "Makes", detail: "Larger original games" },
  { term: "Now", detail: "Aphelion Run" },
  { term: "Arcade", detail: "Riffle Poker, Scribble, Warships, Whodunit?" },
  { term: "Plays in", detail: "Your browser" },
];

export function StudioStory() {
  return (
    <section
      id="studio"
      aria-labelledby="studio-heading"
      className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-10"
    >
      <div className="flex flex-col gap-3">
        <HudLabel tone="mark">The studio</HudLabel>
        <h2 id="studio-heading" className="font-display text-title font-medium">
          Who we are
        </h2>
        <div className="flex max-w-[62ch] flex-col gap-4 text-ink-muted md:text-body-l">
          <p>
            Galaxy Class is an independent studio making larger original games,
            starting with Aphelion Run.
          </p>
          <p>
            The Arcade is where the smaller games live: Riffle Poker, Scribble,
            Warships, and Whodunit?. They run in the browser. Arcade play uses
            social chips, and there is nothing to buy.
          </p>
        </div>
      </div>

      <dl className="panel flex flex-col divide-y divide-bezel px-5 py-2">
        {sheet.map((row) => (
          <div key={row.term} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="shrink-0 font-hud text-hud uppercase tracking-[0.18em] text-ink-muted">{row.term}</dt>
            <dd className="min-w-0 text-right font-semibold text-ink">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
