"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Reveal, useMotionAllowed, useSectionProgress } from "@/components/studio/motion";
import { gcType } from "@/components/studio/ui";
import type { AphelionBeat } from "@/content/aphelion-promo";
import { CssPlanet } from "./CssPlanet";
import styles from "./aphelion.module.css";

const WIDE_QUERY = "(min-width: 768px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia?.(WIDE_QUERY);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
const getWide = () => window.matchMedia?.(WIDE_QUERY).matches ?? false;
const getWideServer = () => false;

// The orbit: an ellipse centered in an 800×600 view, tilted -16°. It starts at the far left
// and runs clockwise. The planet sits at its center.
const VIEW_W = 800;
const VIEW_H = 600;
const CX = 400;
const CY = 300;
const RX = 370;
const RY = 175;
const TILT = -16;
const ORBIT_PATH = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX + RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX - RX} ${CY}`;

function BeatCopy({ beat, total }: { beat: AphelionBeat; total: number }) {
  return (
    <>
      <p aria-hidden="true" className={`font-gc-mono text-gc-mono font-medium uppercase ${styles.beatIndex}`}>
        {beat.index} / {String(total).padStart(2, "0")}
      </p>
      <h3 className={`${gcType.d2} uppercase ${styles.beatVerb}`}>{beat.verb}</h3>
      <p className={`${gcType.lead} ${styles.beatBody}`}>{beat.body}</p>
    </>
  );
}

/** Default markup: a vertical list. Used on phones, with motion off, and before hydration. */
function StackedBeats({ beats }: { beats: readonly AphelionBeat[] }) {
  return (
    <div className={styles.beats}>
      <span className={styles.beatsRail} aria-hidden="true" />
      <ol className="m-0 list-none p-0" aria-label="How a run goes">
        {beats.map((beat) => (
          <Reveal key={beat.index} as="li" className={styles.beat}>
            <div>
              <BeatCopy beat={beat} total={beats.length} />
            </div>
            <div className={styles.beatPlanet}>
              <CssPlanet planet={beat.planet} />
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}

/**
 * The pinned stage: a 400vh track holding a sticky 100vh stage. Scroll progress draws a gold
 * orbit, a ship rides its tip, and the four beats crossfade at 0, .25, .5, and .75.
 * Per-frame work is imperative (dash offset and ship position); React state changes only
 * when the active beat changes.
 */
function PinnedBeats({ beats }: { beats: readonly AphelionBeat[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<SVGPathElement>(null);
  const shipRef = useRef<SVGGElement>(null);
  const lengthRef = useRef(0);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  const count = beats.length;
  const onProgress = useCallback(
    (p: number) => {
      const path = drawRef.current;
      if (path) {
        const drawn = Math.min(1, p / 0.97);
        path.style.strokeDashoffset = String(1 - drawn);
        if (typeof path.getTotalLength === "function") {
          if (!lengthRef.current) lengthRef.current = path.getTotalLength();
          const point = path.getPointAtLength(drawn * lengthRef.current);
          shipRef.current?.setAttribute("transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
        }
      }
      const next = Math.min(count - 1, Math.floor(p * count));
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
      }
    },
    [count],
  );
  useSectionProgress(trackRef, { mode: "pin", onProgress });

  // Waypoints sit where the ship is mid-beat, so each lights as its beat takes the stage.
  const waypoints = beats.map((beat, i) => {
    const fraction = (i + 0.5) / count;
    const angle = Math.PI + fraction * Math.PI * 2; // start at the left, clockwise on screen
    return { beat, fraction, x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
  });

  return (
    <div ref={trackRef} className={`gc-progress ${styles.pin}`} data-testid="aphelion-pinned">
      <div className={styles.pinStage}>
        <div className={styles.pinCopy}>
          <p className="sr-only">Four beats of a run, shown one at a time as you scroll.</p>
          {beats.map((beat, i) => (
            <div key={beat.index} className={styles.pinBeat} data-active={i === active}>
              <BeatCopy beat={beat} total={count} />
            </div>
          ))}
        </div>

        <div className={styles.pinArt} aria-hidden="true">
          {beats.map((beat, i) => (
            <CssPlanet key={beat.index} planet={beat.planet} className={styles.pinPlanet} active={i === active} />
          ))}
          <svg className={styles.orbitSvg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} focusable="false">
            <g transform={`rotate(${TILT} ${CX} ${CY})`}>
              <path className={styles.orbitBase} d={ORBIT_PATH} />
              <path
                ref={drawRef}
                className={styles.orbitDraw}
                d={ORBIT_PATH}
                pathLength={1}
                style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
              />
              {waypoints.map(({ beat, x, y }, i) => (
                <g key={beat.index}>
                  <circle className={styles.waypoint} cx={x} cy={y} r="6" data-reached={i <= active} />
                  <text
                    className={styles.waypointLabel}
                    x={x}
                    y={y + (y > CY ? 30 : -18)}
                    textAnchor="middle"
                    data-reached={i <= active}
                  >
                    {beat.index} {beat.verb}
                  </text>
                </g>
              ))}
              <g ref={shipRef} transform={`translate(${CX - RX} ${CY})`}>
                <circle className={styles.shipHalo} r="15" />
                <circle className={styles.shipDot} r="5.5" />
              </g>
            </g>
          </svg>
        </div>

        <div className={styles.pinReadout} aria-hidden="true">
          <span>
            Leg {beats[active]?.index} / {String(count).padStart(2, "0")}
          </span>
          <span className={styles.pinRail}>
            <span className={styles.pinRailFill} />
          </span>
          <span>{beats[active]?.verb}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The four story beats. The stacked list is the default (and the no-JS render); it upgrades to
 * the pinned orbit stage only when the browser is at least md wide and motion is allowed.
 */
export function OrbitBeats({ beats }: { beats: readonly AphelionBeat[] }) {
  const motionAllowed = useMotionAllowed();
  const wide = useSyncExternalStore(subscribeWide, getWide, getWideServer);

  return motionAllowed && wide ? <PinnedBeats beats={beats} /> : <StackedBeats beats={beats} />;
}
