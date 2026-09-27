import Image from "next/image";
import type { ReactNode } from "react";

export const PLAY_RIFFLE_HREF = "/riffle";
export const SIGN_IN_HREF = "/sign-in";
export const SIGN_UP_HREF = "/sign-up";

export function Frame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-frame px-6 lg:px-20 ${className}`}>
      {children}
    </div>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="flex items-center gap-3">
      <span
        className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-gold bg-deep text-label font-semibold text-gold"
        aria-hidden="true"
      >
        GC
      </span>
      <span className="text-eyebrow font-semibold uppercase text-fg">
        Galaxy Class
      </span>
    </a>
  );
}

type EyebrowTone = "stellar" | "gold" | "muted";

const eyebrowTone: Record<EyebrowTone, string> = {
  stellar: "text-stellar",
  gold: "text-gold",
  muted: "text-fg-muted",
};

export function Eyebrow({
  children,
  tone = "stellar",
}: {
  children: ReactNode;
  tone?: EyebrowTone;
}) {
  return (
    <p className={`text-eyebrow font-semibold uppercase ${eyebrowTone[tone]}`}>
      {children}
    </p>
  );
}

export function Tag({ status }: { status: "live" | "lab" }) {
  const live = status === "live";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 ${
        live ? "border-riffle text-riffle" : "border-line text-fg-muted"
      }`}
    >
      <Image
        src={live ? "/figma/tag-live-dot.svg" : "/figma/tag-lab-dot.svg"}
        alt=""
        width={8}
        height={8}
        unoptimized
      />
      <span className="text-eyebrow font-semibold uppercase">
        {live ? "Live" : "In the lab"}
      </span>
    </span>
  );
}

function Arrow() {
  return <span aria-hidden="true">{"\u00a0\u00a0→"}</span>;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  arrow = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  arrow?: boolean;
}) {
  const tone =
    variant === "primary"
      ? "bg-gold text-void hover:bg-gold/90"
      : "border border-line text-fg hover:border-fg-muted";

  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 py-3 text-label font-semibold transition ${tone}`}
    >
      {children}
      {arrow && <Arrow />}
    </a>
  );
}

export function TextLink({
  href,
  children,
  arrow = false,
}: {
  href: string;
  children: ReactNode;
  arrow?: boolean;
}) {
  return (
    <a
      href={href}
      className="inline-flex whitespace-nowrap p-2 text-label font-semibold text-fg underline-offset-4 transition hover:underline"
    >
      {children}
      {arrow && <Arrow />}
    </a>
  );
}
