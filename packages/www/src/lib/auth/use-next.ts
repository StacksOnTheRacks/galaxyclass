"use client";

import { useEffect, useState } from "react";
import { readNextParam } from "./safe-next";

/** Read after mount so the static export's server HTML and the first client render agree. */
export function useNextParam(): string | null {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    setNext(readNextParam());
  }, []);
  return next;
}
