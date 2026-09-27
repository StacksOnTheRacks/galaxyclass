"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

// The static export is prerendered without a motion preference, so the first
// client render must match it; the real preference applies after hydration.
export function usePrefersReducedMotion() {
  const reduce = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated && reduce === true;
}
