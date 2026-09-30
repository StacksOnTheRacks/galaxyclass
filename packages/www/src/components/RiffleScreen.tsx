"use client";

import { motion } from "framer-motion";
import { PlayingCard, type Suit } from "./PlayingCard";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

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
  { x: 8, y: 72 },
  { x: 8, y: 26 },
  { x: 50, y: 0 },
  { x: 92, y: 26 },
  { x: 92, y: 72 },
];

export function RiffleWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-body font-bold lowercase tracking-tight text-riffle [text-shadow:0_0_14px_rgb(var(--c-riffle)/0.55)] ${className}`}
    >
      riffle
    </span>
  );
}

function Chip() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 rounded-full border-2 border-dashed border-ink bg-pink"
    />
  );
}

function Board({ animate }: { animate: boolean }) {
  return (
    <div className="flex gap-1.5 sm:gap-2">
      {board.map((card, index) =>
        animate ? (
          <motion.div
            key={`${card.rank}${card.suit}`}
            data-motion="deal"
            initial={{ y: -28, opacity: 0, rotate: -10 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.55 + index * 0.12, duration: 0.32, ease: "easeOut" }}
          >
            <PlayingCard rank={card.rank} suit={card.suit} />
          </motion.div>
        ) : (
          <PlayingCard key={`${card.rank}${card.suit}`} rank={card.rank} suit={card.suit} />
        ),
      )}
    </div>
  );
}

function Table({ animate }: { animate: boolean }) {
  return (
    <div className="relative flex h-full w-full flex-col p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <RiffleWordmark className="text-[22px] sm:text-[28px]" />
        <span className="font-hud text-[10px] uppercase tracking-[0.12em] text-ink/80 sm:text-hud">
          NL Hold&rsquo;em · Social chips
        </span>
      </div>

      <div className="relative mx-auto mt-4 w-[88%] flex-1 sm:mt-5">
        <div className="felt absolute inset-[6%] rounded-[999px] border-[10px] border-riffle-rail shadow-[inset_0_0_40px_rgb(0_0_0/0.6),0_0_0_2px_rgb(var(--c-riffle)/0.35)] sm:border-[14px]" />
        {seats.map((seat, index) => (
          <span
            key={index}
            className={`absolute size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-hud text-[9px] uppercase sm:flex sm:size-11 sm:text-[10px] ${
              seat.you ? "flex" : "hidden"
            } ${
              seat.you
                ? "border-2 border-riffle bg-void text-riffle shadow-glow-riffle"
                : "border-2 border-dashed border-ink/40 bg-void/80 text-ink/60"
            }`}
            style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
          >
            {seat.you ? "You" : "+"}
          </span>
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3">
          <Board animate={animate} />
          <span className="inline-flex items-center gap-2 rounded-full bg-void/80 px-3 py-1 font-hud text-[10px] uppercase text-ink sm:text-hud">
            <Chip /> Pot 1,240
          </span>
        </div>
      </div>

      <div className="mt-6 flex justify-center sm:mt-8">
        {animate ? (
          <span
            data-motion="blink"
            className="font-hud text-hud uppercase text-amber [animation:blink_1.1s_steps(1,end)_infinite_1.4s]"
          >
            Press play
          </span>
        ) : (
          <span className="font-hud text-hud uppercase text-amber">Press play</span>
        )}
      </div>
    </div>
  );
}

export function RiffleScreen({ className = "" }: { className?: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const animate = !reduceMotion;

  return (
    <div
      role="img"
      aria-label="Riffle attract screen: a Hold'em table with five community cards and a pot of social chips"
      className={`crt bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--c-riffle)/0.12),transparent_70%)] ${className}`}
    >
      {animate ? (
        <motion.div
          data-motion="power-on"
          className="h-full w-full origin-center"
          initial={{ scaleY: 0.02, opacity: 0.3, filter: "brightness(2.4)" }}
          animate={{ scaleY: 1, opacity: 1, filter: "brightness(1)" }}
          transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}
        >
          <Table animate />
        </motion.div>
      ) : (
        <Table animate={false} />
      )}
    </div>
  );
}

export function RiffleTileScreen({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`crt flex flex-col p-3 ${className}`}>
      <RiffleWordmark className="text-[18px]" />
      <div className="felt mx-auto mt-2 flex w-[82%] flex-1 items-center justify-center gap-1 rounded-[999px] border-[7px] border-riffle-rail">
        <PlayingCard rank="A" suit="spade" size="xs" />
        <PlayingCard rank="K" suit="heart" size="xs" />
        <PlayingCard rank="9" suit="club" size="xs" />
      </div>
    </div>
  );
}
