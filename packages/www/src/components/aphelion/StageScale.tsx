"use client";

import { useRef, type ReactNode } from "react";
import { useSectionProgress } from "@/components/studio/motion";
import styles from "./aphelion.module.css";

/**
 * Wraps the promo stage. `useSectionProgress` writes `--p` (0–1) on the outer element;
 * the inner element reads it to scale from 0.92 to 1.0 as the stage enters view (md and up,
 * motion on). Measuring the outer node keeps the transform from feeding back into the
 * measurement. With motion off `--p` is pinned to 1, so the stage rests at full size.
 */
export function StageScale({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionProgress(ref, { mode: "pass" });

  return (
    <div ref={ref} className={`gc-progress ${styles.stageWrap}`}>
      <div className={styles.stageScale}>{children}</div>
    </div>
  );
}
