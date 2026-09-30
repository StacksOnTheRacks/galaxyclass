export type Suit = "spade" | "heart" | "diamond" | "club";

const suitSymbol: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

type PlayingCardProps = {
  rank: string;
  suit: Suit;
  size?: "sm" | "xs";
  className?: string;
};

const sizeClass = {
  sm: "h-[64px] w-[46px] rounded-[6px] pl-[6px] pt-[5px] text-[14px] leading-[15px] sm:h-[78px] sm:w-[56px] sm:text-[16px] sm:leading-[17px]",
  xs: "h-[44px] w-[32px] rounded-[4px] pl-[4px] pt-[3px] text-[11px] leading-[12px]",
};

export function PlayingCard({
  rank,
  suit,
  size = "sm",
  className = "",
}: PlayingCardProps) {
  const ink =
    suit === "heart" || suit === "diamond" ? "text-suit-red" : "text-suit-black";

  return (
    <div
      className={`shrink-0 bg-ink font-body font-bold shadow-[0_6px_14px_rgb(0_0_0/0.45)] ${sizeClass[size]} ${ink} ${className}`}
      aria-hidden="true"
    >
      {rank}
      <span className="block">{suitSymbol[suit]}</span>
    </div>
  );
}
