type Suit = "spade" | "heart" | "diamond" | "club";

const suitSymbol: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

type PlayingCardProps = {
  rank: string;
  suit: Suit;
  size?: "lg" | "sm";
  className?: string;
};

export function PlayingCard({
  rank,
  suit,
  size = "lg",
  className = "",
}: PlayingCardProps) {
  const ink =
    suit === "heart" || suit === "diamond" ? "text-suit-red" : "text-suit-black";

  if (size === "sm") {
    return (
      <div
        className={`h-[72px] w-[52px] shrink-0 rounded-[6px] bg-fg pl-[7px] pt-[6px] font-display text-[14px] font-bold leading-[15px] ${ink} ${className}`}
        aria-hidden="true"
      >
        {rank}
        <span className="block">{suitSymbol[suit]}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative h-[156px] w-[112px] shrink-0 rounded-md bg-fg font-display font-bold shadow-[0px_24px_48px_0px_rgba(0,0,0,0.55)] ${ink} ${className}`}
      aria-hidden="true"
    >
      <span className="absolute left-3 top-[10px] text-[20px] leading-[22px]">
        {rank}
        <span className="block">{suitSymbol[suit]}</span>
      </span>
      <span className="absolute left-1/2 top-[50px] -translate-x-1/2 text-[48px]">
        {suitSymbol[suit]}
      </span>
    </div>
  );
}
