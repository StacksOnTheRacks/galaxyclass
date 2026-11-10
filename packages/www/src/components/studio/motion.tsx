"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Studio motion infrastructure.
 *
 * `useMotionAllowed()` is the single source of truth for JS effects:
 * `!prefers-reduced-motion && userPref !== "off"`. The provider mirrors it to
 * `data-motion` on the closest `.studio` element, which `studio.css` reads to
 * stop every `gc-*` animation and transform.
 *
 * Every browser API is guarded so server render, jsdom, and old browsers work.
 */

export const MOTION_STORAGE_KEY = "gc.motion";
export type MotionPref = "on" | "off";

type MotionValue = {
  /** True when motion effects may run. */
  allowed: boolean;
  /** The visitor's toggle. */
  userPref: MotionPref;
  /** The OS asks for reduced motion (the toggle cannot override it). */
  systemReduced: boolean;
  setUserPref: (pref: MotionPref) => void;
};

const MotionContext = createContext<MotionValue>({
  allowed: true,
  userPref: "on",
  systemReduced: false,
  setUserPref: () => {},
});

function readPref(): MotionPref {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function MotionProvider({ children }: { children: ReactNode }) {
  const [userPref, setPref] = useState<MotionPref>("on");
  const [systemReduced, setSystemReduced] = useState(false);
  const [wrapper, setWrapper] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPref(readPref());
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_STORAGE_KEY) setPref(readPref());
    };
    window.addEventListener("storage", onStorage);

    const query = window.matchMedia?.(REDUCED_QUERY);
    if (query) setSystemReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemReduced(event.matches);
    query?.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      query?.removeEventListener?.("change", onChange);
    };
  }, []);

  const allowed = !systemReduced && userPref !== "off";

  useEffect(() => {
    const root = wrapper?.closest<HTMLElement>(".studio");
    if (!root) return;
    root.setAttribute("data-motion", allowed ? "on" : "off");
  }, [wrapper, allowed]);

  const setUserPref = useCallback((pref: MotionPref) => {
    setPref(pref);
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, pref);
    } catch {
      // Storage can be blocked; the toggle still works for this page view.
    }
  }, []);

  const value = useMemo(
    () => ({ allowed, userPref, systemReduced, setUserPref }),
    [allowed, userPref, systemReduced, setUserPref],
  );

  return (
    <MotionContext.Provider value={value}>
      {/* display: contents keeps the shell's flex layout while giving us a node to find .studio from. */}
      <div ref={setWrapper} className="contents">
        {children}
      </div>
    </MotionContext.Provider>
  );
}

export function useMotion(): MotionValue {
  return useContext(MotionContext);
}

/** True when motion effects (starfield, scrubbing, autoplay, parallax) may run. */
export function useMotionAllowed(): boolean {
  return useContext(MotionContext).allowed;
}

/** `Motion: On / Off` (WCAG 2.2.2). Persists to localStorage["gc.motion"]. */
export function MotionToggle({ className = "" }: { className?: string }) {
  const { allowed, userPref, systemReduced, setUserPref } = useMotion();
  const on = allowed;

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={systemReduced}
      title={systemReduced ? "Your system is set to reduce motion" : undefined}
      onClick={() => setUserPref(userPref === "off" ? "on" : "off")}
      className={`inline-flex min-h-11 items-center gap-2 px-2 font-gc-mono text-gc-mono-s uppercase text-gc-ink-3 transition-colors duration-gc-2 hover:text-gc-ink disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${on ? "bg-gc-solar" : "bg-gc-rule-2"}`} />
      Motion: {on ? "On" : "Off"}
    </button>
  );
}

type ViewOptions = {
  rootMargin?: string;
  threshold?: number | number[];
  /** Stay true after the first intersection. */
  once?: boolean;
};

/** Whether `ref` intersects the viewport. Defaults to true without IntersectionObserver. */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = "0px", threshold = 0, once = false }: ViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin, threshold, once]);

  return inView;
}

type ProgressOptions = {
  /**
   * "pass": 0 as the section's top enters the viewport bottom, 1 as its bottom leaves the top.
   * "pin": 0 when the section top reaches the viewport top, 1 when its bottom reaches the viewport
   * bottom (for a tall section holding a sticky stage).
   */
  mode?: "pass" | "pin";
  /** Called with each new 0–1 value (for effects beyond the `--p` custom property). */
  onProgress?: (p: number) => void;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Writes the section's scroll progress (0–1) to `--p` on `ref.current`.
 * rAF-throttled and only active while the section is near the viewport.
 * With motion off (or no IntersectionObserver) it pins `--p` to 1.
 */
export function useSectionProgress<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { mode = "pass", onProgress }: ProgressOptions = {},
): void {
  const allowed = useMotionAllowed();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const write = (p: number) => {
      node.style.setProperty("--p", p.toFixed(4));
      onProgress?.(p);
    };

    if (!allowed || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      write(1);
      return;
    }

    let frame = 0;
    let listening = false;

    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p =
        mode === "pin"
          ? clamp01(-rect.top / Math.max(1, rect.height - vh))
          : clamp01((vh - rect.top) / (vh + rect.height));
      write(p);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const attach = () => {
      if (listening) return;
      listening = true;
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      schedule();
    };
    const detach = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) attach();
          else {
            detach();
            // Settle at the end the section left from.
            const rect = node.getBoundingClientRect();
            write(rect.top < 0 ? 1 : 0);
          }
        }
      },
      { rootMargin: "20% 0px 20% 0px" },
    );
    observer.observe(node);
    measure();

    return () => {
      observer.disconnect();
      detach();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref, allowed, mode, onProgress]);
}

type RevealProps = {
  as?: ElementType;
  /** Stagger in ms (use multiples of 60). */
  delay?: number;
  /** Add a 6px blur-in (headings). */
  blur?: boolean;
  className?: string;
  children?: ReactNode;
  id?: string;
};

/**
 * Fade-and-rise on entry. Renders fully visible in static HTML; after hydration only
 * elements below the fold are marked `data-reveal="pending"`, then released on intersect.
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  blur = false,
  className = "",
  children,
  id,
}: RevealProps) {
  const allowed = useMotionAllowed();
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!node) return;
    if (!allowed || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      node.removeAttribute("data-reveal");
      return;
    }
    const rect = node.getBoundingClientRect();
    if (rect.top < (window.innerHeight || 0)) return; // At or above the fold: stay visible.

    node.setAttribute("data-reveal", "pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.setAttribute("data-reveal", "done");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, allowed]);

  const style = { "--gc-delay": `${delay}ms` } as CSSProperties;
  return createElement(
    Tag,
    {
      ref: setNode,
      id,
      style,
      className: `gc-reveal ${blur ? "gc-reveal--blur" : ""} ${className}`.trim(),
    },
    children,
  );
}
