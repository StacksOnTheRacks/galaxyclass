import Image from "next/image";
import { PlayingCard } from "./PlayingCard";
import { ButtonLink, Eyebrow, Frame, PLAY_RIFFLE_HREF, Tag } from "./primitives";

const features = [
  "Play chips only — nothing to buy",
  "Runs in your browser — nothing to install",
  "Pull up a seat without an account",
];

const board = [
  { rank: "A", suit: "spade" },
  { rank: "K", suit: "heart" },
  { rank: "9", suit: "club" },
  { rank: "9", suit: "diamond" },
  { rank: "4", suit: "spade" },
] as const;

type Seat = {
  name: string;
  stack: string;
  local?: boolean;
  acting?: boolean;
  folded?: boolean;
};

const seats: Seat[] = [
  { name: "You", stack: "$1,860", local: true, acting: true },
  { name: "Maya", stack: "$2,410" },
  { name: "Jules", stack: "$1,275" },
  { name: "Dev", stack: "$940", folded: true },
  { name: "Ana", stack: "$2,030" },
];

function SeatTile({ seat }: { seat: Seat }) {
  const border = seat.acting
    ? "border-2 border-riffle"
    : seat.local
      ? "border border-fg-muted"
      : "border border-line";

  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md bg-surface px-2 pb-3 pt-4 ${border} ${
        seat.folded ? "opacity-50" : ""
      } ${seat.local ? "flex-[1.3]" : ""}`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-full bg-elevated font-display text-[15px] font-bold ${
          seat.acting ? "text-riffle" : "text-fg"
        }`}
      >
        {seat.name[0]}
      </span>
      <span
        className={`text-[13px] font-semibold leading-4 ${
          seat.acting ? "text-riffle" : "text-fg"
        }`}
      >
        {seat.name}
      </span>
      <span className="text-[12px] leading-4 text-fg-muted">
        {seat.folded ? "Fold" : seat.stack}
      </span>
    </div>
  );
}

function TableIllustration() {
  return (
    <div
      className="hidden w-[600px] shrink-0 flex-col gap-4 rounded-xl border border-line bg-void p-5 xl:flex"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-[16px] font-bold text-fg">riffle</span>
          <span className="h-4 w-px bg-line" />
          <span className="text-[13px] font-semibold text-fg">Riffle table</span>
          <span className="rounded-full bg-elevated px-2 py-[2px] text-[11px] font-semibold text-fg-muted">
            No-Limit Hold&rsquo;em
          </span>
        </div>
        <span className="text-[12px] text-fg-muted">Hand #12 · $1 / $2 · River</span>
      </div>

      <div className="flex items-stretch gap-2">
        {seats.map((seat) => (
          <SeatTile key={seat.name} seat={seat} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 rounded-md border border-line bg-surface px-5 py-5">
        <div className="flex gap-2">
          {board.map((card) => (
            <PlayingCard
              key={`${card.rank}${card.suit}`}
              rank={card.rank}
              suit={card.suit}
              size="sm"
            />
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-void px-[14px] py-[6px] text-label font-semibold">
          <Image src="/figma/pot-chip.svg" alt="" width={12} height={12} unoptimized />
          Pot 1,240
        </div>
      </div>

      <div className="flex gap-2">
        {["Fold", "Call $40", "Raise"].map((label) => (
          <span
            key={label}
            className={`flex-1 rounded-md py-2 text-center text-[13px] font-semibold ${
              label === "Raise" ? "bg-riffle text-void" : "border border-line text-fg"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RiffleFeature() {
  return (
    <section id="games" aria-labelledby="games-heading" className="pb-20 pt-10">
      <Frame className="flex flex-col gap-12">
        <div className="flex max-w-[760px] flex-col gap-4">
          <Eyebrow>Our games</Eyebrow>
          <h2
            id="games-heading"
            className="font-display text-[40px] font-bold leading-[44px] tracking-[-0.8px] sm:text-display-l"
          >
            First to the table: Riffle.
          </h2>
        </div>

        <article
          id="riffle"
          aria-labelledby="riffle-heading"
          className="flex flex-col items-center justify-between gap-12 rounded-xl border border-riffle bg-deep px-6 py-10 shadow-[0px_0px_80px_0px_rgba(61,232,166,0.12)] sm:px-12 sm:py-16 xl:flex-row xl:pl-16 xl:pr-12"
        >
          <div className="flex w-full flex-col items-start gap-6 xl:w-[520px] xl:shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <Tag status="live" />
              <Eyebrow tone="muted">Featured game · 01</Eyebrow>
            </div>

            <h3
              id="riffle-heading"
              className="font-display text-[56px] font-bold leading-[60px] tracking-[-1.12px] sm:text-display-xl"
            >
              Riffle
            </h3>

            <p className="text-body-l text-fg-muted">
              Real no-limit Texas Hold&rsquo;em with the people you actually
              want to play with. Send a link, take a seat, deal.
            </p>

            <ul className="flex flex-col gap-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-body-m">
                  <span
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-riffle text-[12px] font-bold text-void"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-4">
              <ButtonLink href={PLAY_RIFFLE_HREF} arrow>
                Play Riffle
              </ButtonLink>
              <p className="text-body-m text-fg-muted">galaxyclass.app/riffle</p>
            </div>
          </div>

          <TableIllustration />
        </article>
      </Frame>
    </section>
  );
}
