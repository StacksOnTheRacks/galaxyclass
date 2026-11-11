"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "@/components/studio/icons";
import { useInView, useMotionAllowed } from "@/components/studio/motion";
import { HudFrame } from "@/components/studio/ui";
import {
  APHELION_BEATS,
  PROMO_COPY,
  PROMO_STILLS,
  STILLS_DIR,
  STILL_HEIGHT,
  STILL_WIDTH,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  type BeatId,
} from "@/content/aphelion-promo";
import styles from "./aphelion.module.css";

/** How long each still holds before the next one crossfades in. */
export const STILL_DWELL_MS = 6500;
/** Crossfade length; the drifted-out still keeps its animation this long so it never snaps back. */
const FADE_MS = 1600;

const pad = (n: number) => String(n).padStart(2, "0");

function Shot({
  id,
  width,
  height,
  size,
  alt,
  className,
}: {
  id: string;
  width: number;
  height: number;
  size: typeof STILL_WIDTH | typeof THUMB_WIDTH;
  alt: string;
  className?: string;
}) {
  return (
    <img
      className={className}
      src={`${STILLS_DIR}/${id}-${size}.jpg`}
      width={width}
      height={height}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/**
 * The promo stage: in-engine stills in a HUD frame, with a rail that maps the four story
 * beats (Siphon, Mine, Sell, Survive) to their shots.
 *
 * - Motion on: a slow Ken Burns drift on the shown still and a timed crossfade between
 *   stills, only while the stage is in view. A Pause/Play toggle is always offered, and
 *   choosing a beat by hand stops the slideshow until the visitor starts it again.
 * - Reduced motion or Motion Off: no drift, no auto-advance, no fade. One still holds and
 *   the rail still works.
 * - Images are JPEGs with explicit dimensions inside a 16:9
 *   frame, so nothing shifts. Only the shown still and the next one are in the DOM; the
 *   rest load when the visitor reaches for the rail.
 */
export function PromoStills() {
  const motionAllowed = useMotionAllowed();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { threshold: 0.35 });

  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [loadAll, setLoadAll] = useState(false);

  const activeRef = useRef(0);
  const total = PROMO_STILLS.length;
  const playing = motionAllowed && inView && !userPaused;

  const show = useCallback((index: number) => {
    if (index === activeRef.current) return;
    setPrevious(activeRef.current);
    activeRef.current = index;
    setActive(index);
  }, []);

  // Timed crossfade. Re-armed on every change of still, so a manual choice restarts the dwell.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => show((active + 1) % total), STILL_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, active, total, show]);

  useEffect(() => {
    if (previous === null) return;
    const timer = window.setTimeout(() => setPrevious(null), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [previous]);

  const mounted = useMemo(() => {
    const set = new Set<number>([active, (active + 1) % total]);
    if (previous !== null) set.add(previous);
    if (loadAll) for (let i = 0; i < total; i += 1) set.add(i);
    return set;
  }, [active, previous, loadAll, total]);

  const activeStill = PROMO_STILLS[active];
  const activeBeat = APHELION_BEATS.find((beat) => beat.id === activeStill.beat) ?? APHELION_BEATS[0];

  const chooseBeat = (beat: BeatId) => {
    const index = PROMO_STILLS.findIndex((still) => still.beat === beat);
    if (index < 0) return;
    setUserPaused(true);
    show(index);
  };

  const copy = PROMO_COPY.stage;

  return (
    <div role="group" aria-roledescription="carousel" aria-label={copy.groupAria} className={styles.stills}>
      <HudFrame className={styles.frame}>
        <div ref={stageRef} className={styles.stage} data-playing={playing ? "true" : "false"}>
          {PROMO_STILLS.map((still, index) => {
            if (!mounted.has(index)) return null;
            const isActive = index === active;
            const drifting = motionAllowed && (isActive || index === previous);
            return (
              <div
                key={still.id}
                className={styles.layer}
                data-active={isActive ? "true" : "false"}
                data-drift={drifting ? "true" : "false"}
                aria-hidden={isActive ? undefined : true}
                style={
                  {
                    ["--dx" as string]: `${still.drift.x}%`,
                    ["--dy" as string]: `${still.drift.y}%`,
                  } as CSSProperties
                }
              >
                <Shot
                  id={still.id}
                  width={STILL_WIDTH}
                  height={STILL_HEIGHT}
                  size={STILL_WIDTH}
                  alt={isActive ? still.alt : ""}
                  className={styles.still}
                />
              </div>
            );
          })}

          <div className={styles.frameVignette} aria-hidden="true" />
          {motionAllowed ? (
            <div
              className="gc-scan-line"
              aria-hidden="true"
              style={{ ["--gc-scan" as string]: "rgb(255 215 61 / 0.55)" }}
            />
          ) : null}

          <span className={`${styles.hudLabel} ${styles.hudTopLeft}`} aria-hidden="true">
            <span className={styles.hudMark} />
            {copy.label}
          </span>
          <span className={`${styles.hudLabel} ${styles.hudTopRight}`} aria-hidden="true">
            Still {pad(active + 1)} / {pad(total)}
          </span>
          <span className={`${styles.hudLabel} ${styles.hudBottomLeft}`} aria-hidden="true">
            {activeBeat.index} · {activeBeat.verb}
            <span className={styles.hudReadout}>{activeStill.readout}</span>
          </span>

          {motionAllowed ? (
            <button
              type="button"
              className={styles.ctrl}
              aria-pressed={!playing}
              aria-label={playing ? copy.pause : copy.play}
              onClick={() => setUserPaused((paused) => !paused)}
            >
              {userPaused ? <Play /> : <Pause />}
            </button>
          ) : null}

          {playing ? <span key={active} className={styles.dwell} aria-hidden="true" /> : null}
        </div>
      </HudFrame>

      <ol
        className={styles.rail}
        aria-label={copy.railAria}
        onPointerEnter={() => setLoadAll(true)}
        onFocus={() => setLoadAll(true)}
      >
        {APHELION_BEATS.map((beat) => {
          const still = PROMO_STILLS.find((s) => s.beat === beat.id);
          if (!still) return null;
          const current = activeStill.beat === beat.id;
          return (
            <li key={beat.id}>
              <button
                type="button"
                className={styles.railItem}
                aria-pressed={current}
                data-current={current ? "true" : "false"}
                onClick={() => chooseBeat(beat.id)}
              >
                <span className={styles.thumb}>
                  <Shot
                    id={still.id}
                    width={THUMB_WIDTH}
                    height={THUMB_HEIGHT}
                    size={THUMB_WIDTH}
                    alt=""
                    className={styles.thumbImg}
                  />
                </span>
                <span className={styles.railLabel}>
                  <span aria-hidden="true" className={styles.railIndex}>
                    {beat.index}
                  </span>
                  <span className={styles.railVerb}>{beat.verb}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p aria-live={playing ? "off" : "polite"} className="sr-only">
        {`Showing ${activeBeat.verb}: ${activeStill.readout}.`}
      </p>
    </div>
  );
}
