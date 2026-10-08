type Glow = "dark" | "brass" | "pink";

/** Scene units: a 160×90 storm sky over Starfall Manor, with the lawn starting at GROUND. */
const WIDTH = 160;
const HEIGHT = 90;
const GROUND = 74;
const PANE = { width: 4, height: 5.5 };

const LIT: Record<Exclude<Glow, "dark">, { halo: string; pane: string }> = {
  brass: { halo: "fill-whodunit-brass/25", pane: "fill-whodunit-brass" },
  pink: { halo: "fill-whodunit/30", pane: "fill-whodunit" },
};

const stars: [number, number, number][] = [
  [10, 7, 0.5],
  [30, 15, 0.4],
  [46, 6, 0.6],
  [60, 16, 0.4],
  [100, 6, 0.5],
  [114, 19, 0.4],
  [124, 8, 0.4],
  [150, 28, 0.5],
  [154, 9, 0.6],
];

/** Wing and hall windows; the pink pane upstairs in the east wing has someone in it. */
const windows: { x: number; y: number; glow: Glow }[] = [
  { x: 38.5, y: 49, glow: "dark" },
  { x: 47, y: 49, glow: "brass" },
  { x: 55.5, y: 49, glow: "dark" },
  { x: 38.5, y: 60, glow: "brass" },
  { x: 47, y: 60, glow: "dark" },
  { x: 55.5, y: 60, glow: "brass" },
  { x: 66, y: 41, glow: "brass" },
  { x: 90, y: 41, glow: "dark" },
  { x: 78, y: 46, glow: "dark" },
  { x: 66, y: 52, glow: "dark" },
  { x: 90, y: 52, glow: "brass" },
  { x: 100.5, y: 49, glow: "brass" },
  { x: 109, y: 49, glow: "pink" },
  { x: 117.5, y: 49, glow: "dark" },
  { x: 100.5, y: 60, glow: "dark" },
  { x: 109, y: 60, glow: "brass" },
  { x: 117.5, y: 60, glow: "dark" },
];

const hedges: [number, number][] = [
  [37, 5],
  [50, 6],
  [110, 6],
  [123, 5],
];

const lens = { x: 134, y: 66, r: 10.5 };

function Window({ x, y, glow }: { x: number; y: number; glow: Glow }) {
  if (glow === "dark") {
    return (
      <rect
        x={x}
        y={y}
        width={PANE.width}
        height={PANE.height}
        rx={0.5}
        className="fill-whodunit-night stroke-whodunit-brass/30"
        strokeWidth={0.3}
      />
    );
  }
  const tone = LIT[glow];
  const cx = x + PANE.width / 2;
  return (
    <g>
      <rect
        x={x - 1.2}
        y={y - 1.2}
        width={PANE.width + 2.4}
        height={PANE.height + 2.4}
        rx={1.4}
        className={tone.halo}
      />
      <rect x={x} y={y} width={PANE.width} height={PANE.height} rx={0.5} className={tone.pane} />
      {glow === "pink" ? (
        <g className="fill-void">
          <circle cx={cx} cy={y + 2.2} r={0.95} />
          <path
            d={`M${x + 0.6} ${y + PANE.height} Q${x + 0.8} ${y + 3.4} ${cx} ${y + 3.3} Q${x + 3.2} ${y + 3.4} ${x + 3.4} ${y + PANE.height} Z`}
          />
        </g>
      ) : (
        <g className="stroke-void/60" strokeWidth={0.35}>
          <line x1={cx} y1={y} x2={cx} y2={y + PANE.height} />
          <line x1={x} y1={y + PANE.height / 2} x2={x + PANE.width} y2={y + PANE.height / 2} />
        </g>
      )}
    </g>
  );
}

export function WhodunitWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-display uppercase leading-none tracking-wide text-whodunit [text-shadow:0_0_14px_rgb(var(--c-whodunit)/0.5)] ${className}`}
    >
      Whodunit
      <span className="text-whodunit-brass [text-shadow:0_0_14px_rgb(var(--c-whodunit-brass)/0.55)]">?</span>
    </span>
  );
}

/** Starfall Manor on a stormy night: lit windows, a figure upstairs, a portrait, and a magnifying glass. */
export function WhodunitRoomArt({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`crt flex items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--c-whodunit)/0.18),rgb(var(--c-whodunit-night))_72%)] ${className}`}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
        <rect
          width={WIDTH}
          height={GROUND}
          className="fill-whodunit/10 opacity-0 motion-safe:animate-[storm-flash_7s_linear_infinite]"
        />
        {stars.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className="fill-ink/60" />
        ))}
        <circle cx={136} cy={15} r={11} className="fill-whodunit-brass/10" />
        <path d="M136 8 A7 7 0 0 0 136 22 A9 9 0 0 1 136 8 Z" className="fill-whodunit-brass/90" />
        <polyline
          points="22,1 16,13 21,12.5 14,27"
          className="fill-none stroke-whodunit opacity-0 motion-safe:animate-[storm-flash_7s_linear_infinite]"
          strokeWidth={0.9}
          strokeLinejoin="round"
        />

        <g className="fill-void stroke-whodunit-brass/45" strokeWidth={0.6} strokeLinejoin="round">
          <rect x={39} y={31} width={4} height={9} />
          <rect x={117} y={31} width={4} height={9} />
          <rect x={34} y={44} width={30} height={GROUND - 44} />
          <polygon points="31,44 49,32 67,44" />
          <rect x={96} y={44} width={30} height={GROUND - 44} />
          <polygon points="93,44 111,32 129,44" />
          <rect x={62} y={36} width={36} height={GROUND - 36} />
          <polygon points="59,36 80,22 101,36" />
          <rect x={73} y={14} width={14} height={22} />
          <polygon points="71,14 80,3 89,14" />
          <line x1={80} y1={3} x2={80} y2={0.5} />
        </g>
        <circle cx={80} cy={24} r={4.4} className="fill-whodunit-brass/25" />
        <circle cx={80} cy={24} r={3} className="fill-whodunit-brass" />
        <g className="stroke-void/60" strokeWidth={0.35}>
          <line x1={77} y1={24} x2={83} y2={24} />
          <line x1={80} y1={21} x2={80} y2={27} />
        </g>
        {windows.map((pane) => (
          <Window key={`${pane.x}-${pane.y}`} {...pane} />
        ))}
        <path
          d={`M76 ${GROUND} V66 A4 4 0 0 1 84 66 V${GROUND} Z`}
          className="fill-whodunit-brass/35 stroke-whodunit-brass/60"
          strokeWidth={0.5}
        />

        <rect y={GROUND} width={WIDTH} height={HEIGHT - GROUND} className="fill-void" />
        <polygon
          points={`77,${GROUND} 83,${GROUND} 94,${HEIGHT} 66,${HEIGHT}`}
          className="fill-whodunit-brass/10"
        />
        <g className="fill-void stroke-whodunit-brass/30" strokeWidth={0.4}>
          {hedges.map(([cx, rx]) => (
            <path key={cx} d={`M${cx - rx} ${GROUND} A${rx} 3 0 0 1 ${cx + rx} ${GROUND} Z`} />
          ))}
        </g>
        <text
          x={WIDTH / 2}
          y={84}
          className="fill-whodunit-brass/70 font-hud"
          fontSize={3.6}
          textAnchor="middle"
          dominantBaseline="central"
        >
          Starfall Manor
        </text>

        <g transform="rotate(-6 16 66)">
          <rect x={7} y={53} width={18} height={24} rx={1} className="fill-void stroke-whodunit-brass" strokeWidth={1.4} />
          <rect
            x={9.5}
            y={55.5}
            width={13}
            height={19}
            className="fill-whodunit-night stroke-whodunit-brass/50"
            strokeWidth={0.4}
          />
          <g className="fill-whodunit/45">
            <circle cx={16} cy={62.5} r={3} />
            <path d="M10.5 74.5 Q11 68 16 67.4 Q21 68 21.5 74.5 Z" />
          </g>
          <rect x={12} y={75.2} width={8} height={1.4} rx={0.3} className="fill-whodunit-brass/70" />
        </g>

        <line
          x1={lens.x + 8.5}
          y1={lens.y + 8.5}
          x2={152}
          y2={85}
          className="stroke-whodunit-brass"
          strokeWidth={3.4}
          strokeLinecap="round"
        />
        <line x1={146.5} y1={79} x2={151.5} y2={84.4} className="stroke-void/50" strokeWidth={1} strokeLinecap="round" />
        <circle
          cx={lens.x}
          cy={lens.y}
          r={lens.r}
          className="fill-whodunit-night/80 stroke-whodunit-brass"
          strokeWidth={2.2}
        />
        <circle
          cx={lens.x}
          cy={lens.y}
          r={lens.r - 1.9}
          className="fill-whodunit/10 stroke-whodunit-brass/40"
          strokeWidth={0.4}
        />
        <g className="font-display" fontSize={13} textAnchor="middle" dominantBaseline="central">
          <text x={lens.x} y={lens.y + 0.6} className="fill-whodunit/30 stroke-whodunit/30" strokeWidth={1.6}>
            ?
          </text>
          <text x={lens.x} y={lens.y + 0.6} className="fill-whodunit">
            ?
          </text>
        </g>
        <path
          d={`M${lens.x - 6.5} ${lens.y - 3.5} A7 7 0 0 1 ${lens.x - 3} ${lens.y - 7.2}`}
          className="fill-none stroke-ink/50"
          strokeWidth={0.7}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
