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

const seats = [
  { name: "Maya", className: "left-[278px] top-0", active: true },
  { name: "Jules", className: "left-[548px] top-[110px]" },
  { name: "Dev", className: "left-[548px] top-[290px]" },
  { name: "Sam", className: "left-[278px] top-[356px]" },
  { name: "Ana", className: "left-0 top-[290px]" },
  { name: "Theo", className: "left-0 top-[110px]" },
];

function TableIllustration() {
  return (
    <div
      className="relative hidden h-[420px] w-[600px] shrink-0 xl:block"
      aria-hidden="true"
    >
      <Image
        src="/figma/table-rail.svg"
        alt=""
        width={540}
        height={300}
        unoptimized
        className="absolute left-[30px] top-[60px]"
      />
      <Image
        src="/figma/table-felt.svg"
        alt=""
        width={492}
        height={256}
        unoptimized
        className="absolute left-[54px] top-[82px]"
      />
      <div className="absolute left-[162px] top-[150px] flex gap-2">
        {board.map((card) => (
          <PlayingCard
            key={`${card.rank}${card.suit}`}
            rank={card.rank}
            suit={card.suit}
            size="sm"
          />
        ))}
      </div>
      <div className="absolute left-[240px] top-[240px] flex items-center gap-2 rounded-full bg-void px-[14px] py-[6px] text-label font-semibold">
        <Image src="/figma/pot-chip.svg" alt="" width={12} height={12} unoptimized />
        Pot 1,240
      </div>
      {seats.map((seat) => (
        <div
          key={seat.name}
          className={`absolute flex flex-col items-center gap-[6px] ${seat.className}`}
        >
          <span
            className={`flex size-11 items-center justify-center rounded-full bg-elevated font-display text-[16px] font-bold ${
              seat.active ? "border-2 border-riffle" : "border border-line"
            }`}
          >
            {seat.name[0]}
          </span>
          <span
            className={`text-label font-semibold ${
              seat.active ? "text-riffle" : "text-fg-muted"
            }`}
          >
            {seat.name}
          </span>
        </div>
      ))}
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
