const LETTER_VALUES: Record<string, number> = {
  S: 1,
  C: 3,
  R: 1,
  I: 1,
  B: 3,
  L: 1,
  E: 1,
  W: 4,
  O: 1,
  D: 2,
};

const ACROSS = "SCRIBBLE";
const DOWN = "WORD";
/** WORD runs down column 2 and shares its R with SCRIBBLE on row 2. */
const CROSS_COL = 2;
const CROSS_ROW = 2;

function Tile({ letter, lit = false }: { letter: string; lit?: boolean }) {
  return (
    <span
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[3px] bg-scribble-tile font-display text-[clamp(10px,2.6vw,15px)] leading-none text-scribble-ink shadow-[inset_0_-2px_0_rgb(var(--c-scribble-ink)/0.25)] ${
        lit ? "ring-2 ring-scribble" : ""
      }`}
    >
      {letter}
      <span className="absolute bottom-[6%] right-[8%] font-hud text-[clamp(5px,1.2vw,7px)] leading-none">
        {LETTER_VALUES[letter]}
      </span>
    </span>
  );
}

export function ScribbleWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-display uppercase leading-none tracking-wide text-scribble ${className}`}
    >
      Scribble
    </span>
  );
}

/** The wordmark laid as a scored word with WORD crossing it. */
export function ScribbleRoomArt({ className = "" }: { className?: string }) {
  const cells = Array.from({ length: DOWN.length * ACROSS.length }, (_, index) => {
    const row = Math.floor(index / ACROSS.length);
    const col = index % ACROSS.length;
    if (row === CROSS_ROW) {
      return <Tile key={index} letter={ACROSS[col]!} lit />;
    }
    if (col === CROSS_COL) {
      return <Tile key={index} letter={DOWN[row]!} />;
    }
    return <span key={index} className="aspect-square w-full rounded-[3px] bg-void/15" />;
  });
  return (
    <div
      aria-hidden="true"
      className={`crt flex items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--c-scribble)/0.12),transparent_70%)] p-4 ${className}`}
    >
      <div className="flex w-[90%] max-w-[22rem] items-center justify-center rounded-md border-[5px] border-scribble-ink bg-scribble-board p-2">
        <div className="grid w-full grid-cols-8 gap-[3px]">{cells}</div>
      </div>
    </div>
  );
}
