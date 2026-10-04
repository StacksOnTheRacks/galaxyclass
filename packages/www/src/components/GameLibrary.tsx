"use client";

import { useState, type CSSProperties } from "react";
import {
  ButtonLink,
  HudLabel,
  PLAY_RIFFLE_HREF,
  PLAY_SCRIBBLE_HREF,
  StatusTag,
  type GameStatus,
} from "./primitives";
import { RiffleTileScreen, RiffleWordmark } from "./RiffleScreen";
import { ScribbleTileScreen, ScribbleWordmark } from "./ScribbleScreen";

type Filter = "all" | GameStatus;

type Cabinet =
  | { kind: "riffle"; status: "live" }
  | { kind: "scribble"; status: "live" }
  | { kind: "placeholder"; status: "soon"; slot: string };

const cabinets: Cabinet[] = [
  { kind: "riffle", status: "live" },
  { kind: "scribble", status: "live" },
  { kind: "placeholder", status: "soon", slot: "03" },
  { kind: "placeholder", status: "soon", slot: "04" },
];

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Playable now" },
  { id: "soon", label: "Coming soon" },
];

function count(filter: Filter) {
  return filter === "all"
    ? cabinets.length
    : cabinets.filter((cabinet) => cabinet.status === filter).length;
}

function RiffleCabinet() {
  return (
    <article
      aria-labelledby="library-riffle"
      className="cabinet t-molding group flex h-full flex-col gap-4 p-3 transition duration-base motion-safe:hover:-translate-y-1 hover:shadow-glow-riffle"
      style={{ "--molding": "rgb(var(--c-riffle))" } as CSSProperties}
    >
      <RiffleTileScreen className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-3 px-1">
        <div className="flex flex-col items-start gap-3">
          <StatusTag status="live" />
          <h3 id="library-riffle" className="leading-none">
            <span className="sr-only">Riffle Poker</span>
            <RiffleWordmark className="text-[24px]" />
          </h3>
        </div>
        <p className="text-small text-ink-muted">
          Card game · No-limit Hold&rsquo;em · Browser
        </p>
        <ButtonLink href={PLAY_RIFFLE_HREF} className="mt-auto w-full" arrow>
          Play Riffle Poker
        </ButtonLink>
      </div>
    </article>
  );
}

function ScribbleCabinet() {
  return (
    <article
      aria-labelledby="library-scribble"
      className="cabinet t-molding group flex h-full flex-col gap-4 p-3 transition duration-base motion-safe:hover:-translate-y-1 hover:shadow-glow-scribble"
      style={{ "--molding": "rgb(var(--c-scribble))" } as CSSProperties}
    >
      <ScribbleTileScreen className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-3 px-1">
        <div className="flex flex-col items-start gap-3">
          <StatusTag status="live" />
          <h3 id="library-scribble" className="leading-none">
            <span className="sr-only">Scribble</span>
            <ScribbleWordmark className="text-[24px]" />
          </h3>
        </div>
        <p className="text-small text-ink-muted">
          Word game · Crossword board · 2–4 players · Browser
        </p>
        <ButtonLink href={PLAY_SCRIBBLE_HREF} className="mt-auto w-full" arrow>
          Play Scribble
        </ButtonLink>
      </div>
    </article>
  );
}

function PlaceholderCabinet({ slot }: { slot: string }) {
  const id = `library-slot-${slot}`;

  return (
    <article
      aria-labelledby={id}
      className="cabinet t-molding flex h-full gap-4 border-dashed p-3 sm:flex-col"
      style={{ "--molding": "rgb(var(--c-bezel-hi))" } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="crt no-signal flex aspect-square w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md sm:aspect-[4/3] sm:w-auto sm:gap-2 sm:rounded-screen"
      >
        <span className="font-display text-[22px] text-ink/25 sm:text-[34px]">{slot}</span>
        <span className="font-hud text-[10px] uppercase text-ink-muted sm:text-hud">
          No signal
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-1">
        <div className="flex flex-col items-start gap-3">
          <StatusTag status="soon" />
          <h3 id={id} className="font-display text-[28px] uppercase leading-none text-ink-muted">
            Slot {slot}
          </h3>
        </div>
        <p className="text-small text-ink-muted">
          Pre-launch placeholder. A future Galaxy Class game goes here —
          nothing to play yet.
        </p>
      </div>
    </article>
  );
}

export function GameLibrary() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = cabinets.filter(
    (cabinet) => filter === "all" || cabinet.status === filter,
  );

  return (
    <section id="library" aria-labelledby="library-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <HudLabel tone="pink">The floor</HudLabel>
          <h2 id="library-heading" className="font-display text-display-l uppercase">
            Library
          </h2>
          <p className="text-ink-muted">
            {count("live")} {count("live") === 1 ? "game" : "games"} playable now ·{" "}
            {count("soon")} cabinets being built
          </p>
        </div>

        <div
          role="group"
          aria-label="Filter games"
          className="flex flex-wrap gap-1 rounded-md border border-bezel bg-floor p-1"
        >
          {filters.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-sm px-3 text-small font-semibold transition duration-quick ${
                  active
                    ? "bg-raised text-ink shadow-[inset_0_-3px_0_rgb(var(--c-cyan))]"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {option.label}
                <span
                  className={`rounded-sm px-1.5 font-hud text-hud ${
                    active ? "bg-cyan text-void" : "bg-raised text-ink-muted"
                  }`}
                >
                  {count(option.id)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((cabinet) => (
          <li key={cabinet.kind === "placeholder" ? cabinet.slot : cabinet.kind}>
            {cabinet.kind === "riffle" ? (
              <RiffleCabinet />
            ) : cabinet.kind === "scribble" ? (
              <ScribbleCabinet />
            ) : (
              <PlaceholderCabinet slot={cabinet.slot} />
            )}
          </li>
        ))}
      </ul>

      <p className="text-small text-ink-muted">
        More games are in the workshop. One Galaxy Class account will work
        across all of them.
      </p>
    </section>
  );
}
