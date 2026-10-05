import { PlayingCard, type Suit } from "./PlayingCard";

const board: { rank: string; suit: Suit }[] = [
  { rank: "A", suit: "spade" },
  { rank: "K", suit: "heart" },
  { rank: "9", suit: "club" },
  { rank: "9", suit: "diamond" },
  { rank: "4", suit: "spade" },
];

// Seat positions around the oval, as percentages of the felt box.
const seats = [
  { x: 50, y: 100, you: true },
  { x: 10, y: 76 },
  { x: 10, y: 24 },
  { x: 50, y: 0 },
  { x: 90, y: 24 },
  { x: 90, y: 76 },
];

export function RiffleWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-body font-bold tracking-tight text-riffle [text-shadow:0_0_14px_rgb(var(--c-riffle)/0.55)] ${className}`}
    >
      Riffle Poker
    </span>
  );
}

export function RiffleRoomArt({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`crt bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--c-riffle)/0.12),transparent_70%)] p-5 ${className}`}
    >
      <div className="relative h-full w-full">
        <div className="felt absolute inset-[8%] rounded-[999px] border-[8px] border-riffle-rail shadow-[inset_0_0_32px_rgb(0_0_0/0.6),0_0_0_2px_rgb(var(--c-riffle)/0.35)]" />
        {seats.map((seat, index) => (
          <span
            key={index}
            className={`absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-hud text-[8px] uppercase ${
              seat.you
                ? "border-2 border-riffle bg-void text-riffle shadow-glow-riffle"
                : "border-2 border-dashed border-ink/40 bg-void/80 text-ink/60"
            }`}
            style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
          >
            {seat.you ? "You" : ""}
          </span>
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="flex gap-1">
            {board.map((card) => (
              <PlayingCard key={`${card.rank}${card.suit}`} rank={card.rank} suit={card.suit} size="xs" />
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-void/80 px-2.5 py-0.5 font-hud text-[10px] uppercase text-ink">
            <span className="inline-block size-2.5 rounded-full border-2 border-dashed border-ink bg-pink" />
            Pot 1,240
          </span>
        </div>
      </div>
    </div>
  );
}
