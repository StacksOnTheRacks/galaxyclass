"use client";

import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function Bulbs({ className = "" }: { className?: string }) {
  const reduceMotion = usePrefersReducedMotion();

  return reduceMotion ? (
    <div aria-hidden="true" className={`bulbs ${className}`} />
  ) : (
    <div
      aria-hidden="true"
      data-motion="chase"
      className={`bulbs bulbs-chase ${className}`}
    />
  );
}

export function MarqueeStrip({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`marquee-strip ${className}`}>
      <Bulbs className="mx-3 mt-2" />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        {children}
      </div>
      <Bulbs className="mx-3 mb-2" />
    </div>
  );
}
