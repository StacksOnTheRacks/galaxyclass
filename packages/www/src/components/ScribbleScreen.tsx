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
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[3px] bg-scribble-tile font-display text-[clamp(8px,1.5vw,15px)] leading-none text-scribble-ink shadow-[inset_0_-2px_0_rgb(var(--c-scribble-ink)/0.25)] ${
        lit ? "ring-2 ring-scribble" : ""
      }`}
    >
      {letter}
      <span className="absolute bottom-[6%] right-[8%] font-hud text-[clamp(4px,0.7vw,7px)] leading-none">
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

/** Attract screen: the wordmark laid as a scored word with WORD crossing it. */
export function ScribbleTileScreen({ className = "" }: { className?: string }) {
  const cells = Array.from({ length: DOWN.length * ACROSS.length }, (_, index) => {
    const row = Math.floor(index / ACROSS.length);
    const col = index % ACROSS.length;
    if (row === CROSS_ROW) {
      return <Tile key={index} letter={ACROSS[col]!} lit />;
    }
    if (col === CROSS_COL) {
      return <Tile key={index} letter={DOWN[row]!} />;
    }
    return <span key={index} className="aspect-square w-full" />;
  });
  return (
    <div aria-hidden="true" className={`crt flex flex-col p-3 ${className}`}>
      <ScribbleWordmark className="text-[16px]" />
      <div className="mx-auto mt-2 flex w-[88%] flex-1 items-center justify-center rounded-md border-[5px] border-scribble-ink bg-scribble-board px-2">
        <div className="grid w-full grid-cols-8 gap-[3px]">{cells}</div>
      </div>
    </div>
  );
}
