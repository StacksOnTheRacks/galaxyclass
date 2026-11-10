"use client";

import { useEffect, useRef } from "react";
import { useMotionAllowed } from "./motion";

/**
 * Oversized outline "GALAXY CLASS" for the footer. Decorative (aria-hidden).
 * Static HTML is the final state (wdth 130); with motion on and the word below the fold it
 * squeezes to wdth 70 and expands once scrolled into view.
 */
export function OutlineWordmark({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const allowed = useMotionAllowed();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!allowed || !("IntersectionObserver" in window)) {
      node.removeAttribute("data-expand");
      return;
    }
    if (node.getBoundingClientRect().top < (window.innerHeight || 0)) return;

    node.setAttribute("data-expand", "pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.setAttribute("data-expand", "done");
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [allowed]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`gc-outline-word select-none overflow-hidden ${className}`}
      style={{ fontSize: "min(9.4vw, 8.5rem)" }}
    >
      Galaxy Class
    </div>
  );
}
