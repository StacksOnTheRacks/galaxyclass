import type { ReactNode } from "react";

export const PLAY_RIFFLE_HREF = "/riffle";
export const PLAY_SCRIBBLE_HREF = "/scribble";
export const SIGN_IN_HREF = "/sign-in";
export const SIGN_UP_HREF = "/sign-up";
export const ACCOUNT_HREF = "/account";
export const ROOMS_HREF = "/";
export const ABOUT_HREF = "/about";

export function Frame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-frame px-gutter ${className}`}>
      {children}
    </div>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="group flex shrink-0 items-center gap-2 sm:gap-3">
      <span
        className="flex size-9 items-center justify-center rounded-md border-2 border-pink bg-void font-display text-[14px] text-pink shadow-glow-pink transition duration-quick group-hover:text-ink sm:size-10 sm:text-[15px]"
        aria-hidden="true"
      >
        GC
      </span>
      <span className="flex flex-col gap-0.5 whitespace-nowrap leading-none max-[389px]:sr-only">
        <span className="font-display text-[13px] tracking-wide text-ink sm:text-[17px]">
          Galaxy Class
        </span>
        <span className="font-hud text-[9px] uppercase tracking-[0.3em] text-ink-muted sm:text-[10px]">
          Gaming
        </span>
      </span>
    </a>
  );
}

type HudTone = "cyan" | "pink" | "amber" | "muted";

const hudTone: Record<HudTone, string> = {
  cyan: "text-cyan",
  pink: "text-pink",
  amber: "text-amber",
  muted: "text-ink-muted",
};

export function HudLabel({
  children,
  tone = "cyan",
  as: Tag = "p",
  className = "",
}: {
  children: ReactNode;
  tone?: HudTone;
  as?: "p" | "span";
  className?: string;
}) {
  return (
    <Tag className={`font-hud text-hud uppercase ${hudTone[tone]} ${className}`}>
      {children}
    </Tag>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-bezel bg-void/60 px-2 py-1 font-hud text-hud uppercase text-ink-muted">
      {children}
    </span>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-pink text-void shadow-press hover:brightness-110 active:translate-y-[3px] active:shadow-press-down disabled:translate-y-[3px] disabled:shadow-press-down",
  secondary:
    "border-2 border-cyan text-cyan hover:bg-cyan/10 hover:shadow-glow-cyan",
  ghost: "text-ink underline-offset-[6px] hover:text-cyan hover:underline",
};

const sizeClass: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-label",
  lg: "min-h-12 px-7 text-body",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
) {
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-display uppercase tracking-wide transition duration-quick ease-snap disabled:cursor-wait ${variantClass[variant]} ${sizeClass[size]} ${className}`;
}

function Arrow() {
  return (
    <span aria-hidden="true" className="font-body text-[1.1em] leading-none">
      →
    </span>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <a href={href} className={buttonClass(variant, size, className)}>
      {children}
      {arrow && <Arrow />}
    </a>
  );
}

export function TextLink({
  href,
  children,
  arrow = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 font-semibold text-ink underline decoration-bezel-hi decoration-2 underline-offset-[6px] transition duration-quick hover:text-cyan hover:decoration-cyan ${className}`}
    >
      {children}
      {arrow && <Arrow />}
    </a>
  );
}
