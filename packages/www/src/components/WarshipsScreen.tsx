const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const COLS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Board units: a 10-unit marker gutter on the top and left, then ten 10-unit cells. */
const CELL = 10;
const ORIGIN = 10;
const CENTER = ORIGIN + (CELL * ROWS.length) / 2;
const RADIUS = (CELL * ROWS.length) / 2;

const misses: [number, number][] = [
  [0, 2],
  [1, 8],
  [2, 0],
  [3, 9],
  [4, 4],
  [5, 8],
  [6, 1],
  [8, 6],
  [9, 3],
  [7, 7],
];
const hits: [number, number][] = [
  [2, 6],
  [3, 6],
];
/** A sunk Cruiser on row H, columns 2–4. */
const sunk = { row: 7, col: 1, length: 3 };
const ping = hits[1]!;

const cellCenter = (index: number) => ORIGIN + index * CELL + CELL / 2;

function HitPeg({ row, col }: { row: number; col: number }) {
  return (
    <g>
      <circle cx={cellCenter(col)} cy={cellCenter(row)} r={4} className="fill-warships-hit/30" />
      <circle cx={cellCenter(col)} cy={cellCenter(row)} r={2.6} className="fill-warships-hit" />
    </g>
  );
}

export function WarshipsWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-display uppercase leading-none tracking-wide text-warships [text-shadow:0_0_14px_rgb(var(--c-warships)/0.5)] ${className}`}
    >
      Warships
    </span>
  );
}

/** A sonar screen over a 10×10 ocean: misses, two fresh hits, and a sunk hull. */
export function WarshipsRoomArt({ className = "" }: { className?: string }) {
  const edge = ORIGIN + CELL * ROWS.length;
  const wedgeEnd = {
    x: CENTER + RADIUS * Math.sin(Math.PI / 4),
    y: CENTER - RADIUS * Math.cos(Math.PI / 4),
  };

  return (
    <div
      aria-hidden="true"
      className={`crt flex items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--c-warships)/0.14),transparent_70%)] p-3 ${className}`}
    >
      <svg viewBox={`0 0 ${edge + 2} ${edge + 2}`} className="aspect-square h-full max-w-full">
        <rect
          x={ORIGIN}
          y={ORIGIN}
          width={CELL * ROWS.length}
          height={CELL * ROWS.length}
          rx={1.5}
          className="fill-warships-sea stroke-warships/50"
          strokeWidth={0.6}
        />
        {COLS.slice(1).map((_, index) => {
          const at = ORIGIN + (index + 1) * CELL;
          return (
            <g key={index} className="stroke-warships/20" strokeWidth={0.3}>
              <line x1={at} y1={ORIGIN} x2={at} y2={edge} />
              <line x1={ORIGIN} y1={at} x2={edge} y2={at} />
            </g>
          );
        })}
        <g className="fill-warships/70 font-hud" fontSize={4.2} textAnchor="middle" dominantBaseline="central">
          {ROWS.map((label, index) => (
            <text key={label} x={ORIGIN / 2} y={cellCenter(index)}>
              {label}
            </text>
          ))}
          {COLS.map((label, index) => (
            <text key={label} x={cellCenter(index)} y={ORIGIN / 2}>
              {label}
            </text>
          ))}
        </g>

        <g className="fill-none stroke-warships/25" strokeWidth={0.4}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} />
          <circle cx={CENTER} cy={CENTER} r={(RADIUS * 2) / 3} />
          <circle cx={CENTER} cy={CENTER} r={RADIUS / 3} />
        </g>
        <g
          style={{ transformBox: "view-box", transformOrigin: `${CENTER}px ${CENTER}px` }}
          className="motion-safe:animate-[sonar-sweep_6s_linear_infinite]"
        >
          <path
            d={`M${CENTER} ${CENTER} L${CENTER} ${CENTER - RADIUS} A${RADIUS} ${RADIUS} 0 0 1 ${wedgeEnd.x} ${wedgeEnd.y} Z`}
            className="fill-warships/15"
          />
          <line
            x1={CENTER}
            y1={CENTER}
            x2={wedgeEnd.x}
            y2={wedgeEnd.y}
            className="stroke-warships/80"
            strokeWidth={0.6}
          />
        </g>

        {misses.map(([row, col]) => (
          <circle key={`${row}-${col}`} cx={cellCenter(col)} cy={cellCenter(row)} r={1.8} className="fill-ink/80" />
        ))}

        <rect
          x={ORIGIN + sunk.col * CELL + 1}
          y={ORIGIN + sunk.row * CELL + 1.5}
          width={sunk.length * CELL - 2}
          height={CELL - 3}
          rx={3.5}
          className="fill-warships-hit/15 stroke-warships-hit"
          strokeWidth={0.8}
        />
        {Array.from({ length: sunk.length }, (_, index) => (
          <HitPeg key={index} row={sunk.row} col={sunk.col + index} />
        ))}
        {hits.map(([row, col]) => (
          <HitPeg key={`${row}-${col}`} row={row} col={col} />
        ))}

        <circle
          cx={cellCenter(ping[1])}
          cy={cellCenter(ping[0])}
          r={7}
          className="fill-none stroke-warships"
          strokeWidth={0.6}
        />
        <circle
          cx={cellCenter(ping[1])}
          cy={cellCenter(ping[0])}
          r={14}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          className="fill-none stroke-warships opacity-0 motion-safe:animate-[sonar-ping_2.4s_ease-out_infinite]"
          strokeWidth={0.6}
        />
      </svg>
    </div>
  );
}
