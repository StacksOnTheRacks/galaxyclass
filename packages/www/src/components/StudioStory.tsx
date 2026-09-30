import type { CSSProperties } from "react";
import { HudLabel } from "./primitives";

const sheet = [
  { term: "Makes", detail: "Online multiplayer games" },
  { term: "Plays in", detail: "Your browser" },
  { term: "Chips", detail: "Social only — nothing to buy" },
  { term: "First title", detail: "Riffle" },
];

export function StudioStory() {
  return (
    <section
      id="studio"
      aria-labelledby="studio-heading"
      className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start"
    >
      <div className="flex flex-col gap-4">
        <HudLabel tone="cyan">The studio</HudLabel>
        <h2 id="studio-heading" className="font-display text-display-l uppercase">
          Who runs the arcade
        </h2>
        <div className="flex max-w-[62ch] flex-col gap-4 text-body-l text-ink-muted">
          <p>
            Galaxy Class Gaming is an independent studio making online games
            you can play with strangers, or with friends and family.
          </p>
          <p>
            We build for the table, not the wallet: games run in the browser,
            play uses social chips, and there is nothing to buy. Riffle is our
            first game and keeps its own name and look. More titles are on the
            way.
          </p>
          <p>
            One Galaxy Class account follows you from game to game, and unlocks
            extras like private, invite-only tables.
          </p>
        </div>
      </div>

      <div
        className="cabinet t-molding p-5"
        style={{ "--molding": "rgb(var(--c-amber))" } as CSSProperties}
      >
        <HudLabel tone="amber" className="mb-4">
          Studio sheet
        </HudLabel>
        <dl className="flex flex-col divide-y divide-bezel">
          {sheet.map((row) => (
            <div key={row.term} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-hud text-hud uppercase text-ink-muted">{row.term}</dt>
              <dd className="text-right font-semibold text-ink">{row.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
