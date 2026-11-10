import type { ElementType, ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight } from "./icons";

/** Max-width page frame with the studio gutter. */
export function GcFrame({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return <Tag className={`mx-auto w-full max-w-gc-frame px-gc-gutter ${className}`}>{children}</Tag>;
}

/**
 * Type recipes: pair the Tailwind size (`text-gc-*`) with the face/weight/width
 * class (`gc-t-*`). Use as `className={gcType.d1}`.
 */
export const gcType = {
  mega: "text-gc-mega gc-t-mega",
  d1: "text-gc-d1 gc-t-d1",
  d2: "text-gc-d2 gc-t-d2",
  d3: "text-gc-d3 gc-t-d3",
  statement: "text-gc-statement gc-t-statement",
  serif: "text-gc-serif-xl gc-t-serif",
  lead: "font-gc-sans text-gc-lead text-gc-ink-2",
  body: "font-gc-sans text-gc-body",
  small: "font-gc-sans text-gc-small",
} as const;

export type EyebrowTone = "solar" | "stellar" | "ink-3";

const eyebrowTone: Record<EyebrowTone, string> = {
  solar: "text-gc-solar",
  stellar: "text-gc-stellar",
  "ink-3": "text-gc-ink-3",
};

/** Mono micro-label above a heading. */
export function Eyebrow({
  children,
  tone = "solar",
  className = "",
  as: Tag = "p",
}: {
  children: ReactNode;
  tone?: EyebrowTone;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Tag className={`font-gc-mono text-gc-mono font-medium uppercase ${eyebrowTone[tone]} ${className}`}>
      {children}
    </Tag>
  );
}

export type GcButtonVariant = "solar" | "outline" | "ghost";
export type GcButtonIcon = "arrow-right" | "arrow-down" | "arrow-up-right";

/** Class string for a `<button>` or `<a>`; `GcButtonLink` wraps this for links. */
export function gcButtonClass(variant: GcButtonVariant = "solar", size: "md" | "lg" = "md", className = "") {
  return `gc-btn gc-btn--${variant} ${size === "lg" ? "gc-btn--lg" : ""} ${className}`.replace(/\s+/g, " ").trim();
}

function ButtonIcon({ icon }: { icon: GcButtonIcon }) {
  const Icon = icon === "arrow-down" ? ArrowDown : icon === "arrow-up-right" ? ArrowUpRight : ArrowRight;
  return <Icon className="gc-btn__icon" />;
}

/**
 * Studio link button. `external` opens a new tab with `noopener noreferrer`, adds the
 * screen-reader suffix, and shows the up-right arrow.
 */
export function GcButtonLink({
  href,
  children,
  variant = "solar",
  size = "md",
  icon,
  external = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: GcButtonVariant;
  size?: "md" | "lg";
  icon?: GcButtonIcon;
  external?: boolean;
  className?: string;
}) {
  const shownIcon = external ? "arrow-up-right" : icon;
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={gcButtonClass(variant, size, className)}
    >
      {children}
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
      {shownIcon ? <ButtonIcon icon={shownIcon} /> : null}
    </a>
  );
}

/** Frame with corner brackets and a hairline border. Children sit above the brackets. */
export function HudFrame({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return <Tag className={`gc-hud-frame ${className}`}>{children}</Tag>;
}

/** Hairline section divider with a traveling solar pulse (motion-safe). */
export function OrbitRule({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`gc-orbit-rule ${className}`} />;
}

/** Small mono tag. */
export function GcChip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center border border-gc-rule bg-gc-void/60 px-2 py-1 font-gc-mono text-gc-mono-s font-medium uppercase text-gc-ink-2 ${className}`}
    >
      {children}
    </span>
  );
}
