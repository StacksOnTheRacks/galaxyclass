import type { CSSProperties } from "react";
import type { BeatPlanet } from "@/content/aphelion-promo";
import styles from "./aphelion.module.css";

const TONE_CLASS = {
  moon: styles.toneMoon,
  earth: styles.toneEarth,
  mars: styles.toneMars,
} as const;

/**
 * A planet drawn in CSS: a circular mask over two copies of an equirectangular map
 * that slide past in a seamless loop, with a terminator and rim light on top. The Sun
 * has no texture: a radial-gradient core, a corona, and slow rays.
 *
 * Decorative: always `aria-hidden`, images have empty alt. Size with the `--d` custom
 * property (any length) on this element or an ancestor.
 */
export function CssPlanet({
  planet,
  className = "",
  style,
  active,
}: {
  planet: BeatPlanet;
  className?: string;
  style?: CSSProperties;
  /** Sets `data-active` for stages that crossfade several planets. */
  active?: boolean;
}) {
  if (planet.kind === "sun") {
    return (
      <div aria-hidden="true" className={`${styles.planet} ${styles.sun} ${className}`} style={style} data-active={active}>
        <span className={styles.sunRays} />
        <span className={styles.sunCorona} />
        <span className={styles.sunCore} />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${styles.planet} ${TONE_CLASS[planet.tone]} ${className}`}
      style={{ ...style, "--spin": `${planet.spinSeconds}s` } as CSSProperties}
      data-active={active}
    >
      <div className={styles.disc}>
        <div className={`gc-planet-strip ${styles.strip}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={planet.src} alt="" width={1024} height={512} loading="lazy" decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={planet.src} alt="" width={1024} height={512} loading="lazy" decoding="async" />
        </div>
      </div>
    </div>
  );
}
