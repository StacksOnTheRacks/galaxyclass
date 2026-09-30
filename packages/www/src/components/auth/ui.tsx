"use client";

import type { CSSProperties, ReactNode } from "react";
import { MarqueeStrip } from "@/components/Marquee";
import {
  ButtonLink,
  buttonClass,
  Frame,
  HudLabel,
  PLAY_RIFFLE_HREF,
} from "@/components/primitives";
import { SiteShell } from "@/components/SiteShell";

export type AuthScreenKind =
  | "sign-in"
  | "sign-up"
  | "confirm"
  | "forgot"
  | "reset"
  | "account";

type Flow = { label: string; steps: string[]; current: number };

const SIGN_UP_FLOW = ["Create account", "Confirm email", "Sign in"];
const RESET_FLOW = ["Request code", "Set new password", "Sign in"];

const screens: Record<
  AuthScreenKind,
  {
    marquee: string;
    flow?: Flow;
    aside: { kicker: string; headline: string; points: string[] };
  }
> = {
  "sign-in": {
    marquee: "Continue",
    aside: {
      kicker: "Player 1 ready",
      headline: "Welcome back, player.",
      points: [
        "Your account works across every Galaxy Class game.",
        "Start private, invite-only tables for your people.",
        "Social chips only — nothing to buy.",
      ],
    },
  },
  "sign-up": {
    marquee: "New player",
    flow: { label: "Account setup", steps: SIGN_UP_FLOW, current: 0 },
    aside: {
      kicker: "Player card",
      headline: "One account. Every game.",
      points: [
        "Pick a gamer tag — it’s how other players see you.",
        "Works across every Galaxy Class game, starting with Riffle.",
        "Unlocks private, invite-only tables.",
        "Free: nothing to buy, no cashier, no KYC.",
      ],
    },
  },
  confirm: {
    marquee: "New player",
    flow: { label: "Account setup", steps: SIGN_UP_FLOW, current: 1 },
    aside: {
      kicker: "Almost in",
      headline: "Check your inbox for a code.",
      points: [
        "Use the code from the newest Galaxy Class email.",
        "If it does not arrive, ask for a fresh one with Resend code.",
      ],
    },
  },
  forgot: {
    marquee: "Password reset",
    flow: { label: "Password reset", steps: RESET_FLOW, current: 0 },
    aside: {
      kicker: "Locked out?",
      headline: "It happens. Let’s get you back in.",
      points: [
        "We email a reset code to the address on your account.",
        "Then you choose a new password.",
      ],
    },
  },
  reset: {
    marquee: "Password reset",
    flow: { label: "Password reset", steps: RESET_FLOW, current: 1 },
    aside: {
      kicker: "Last step",
      headline: "New password, same player card.",
      points: [
        "Use the code from your reset email.",
        "At least 8 characters, with upper, lower, and a number.",
      ],
    },
  },
  account: {
    marquee: "Player card",
    aside: {
      kicker: "Your account",
      headline: "One sign-in, every game.",
      points: [
        "Your gamer tag and avatar follow you to every table.",
        "Private, invite-only tables in supported games.",
        "Social chips only — nothing to buy.",
      ],
    },
  },
};

function Steps({ flow, done }: { flow: Flow; done: boolean }) {
  const current = done ? flow.current + 1 : flow.current;

  return (
    <ol aria-label={flow.label} className="grid grid-cols-3 gap-2">
      {flow.steps.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex flex-col gap-1.5 rounded-sm border px-2.5 py-2 ${
              state === "current"
                ? "border-cyan bg-cyan/10 text-ink"
                : state === "done"
                  ? "border-bezel bg-floor text-ink-muted"
                  : "border-dashed border-bezel text-ink-muted"
            }`}
          >
            <span className="font-hud text-hud uppercase">
              <span aria-hidden="true">
                {state === "done" ? "✓ " : state === "current" ? "▶ " : ""}
              </span>
              Step {index + 1}
              <span className="sr-only">
                {state === "done" ? " (done)" : state === "upcoming" ? " (next)" : ""}
              </span>
            </span>
            <span className="text-small font-semibold leading-tight">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

function AttractScreen({ kind }: { kind: AuthScreenKind }) {
  const { aside } = screens[kind];

  return (
    <aside
      aria-labelledby="auth-aside-heading"
      className="cabinet flex flex-col p-3 sm:p-4"
    >
      <div className="crt flex flex-1 flex-col justify-between gap-8 bg-[radial-gradient(ellipse_at_20%_0%,rgb(var(--c-pink)/0.18),transparent_60%),radial-gradient(ellipse_at_100%_100%,rgb(var(--c-cyan)/0.14),transparent_60%)] p-6 sm:p-8">
        <div className="flex flex-col gap-4">
          <HudLabel tone="cyan">{aside.kicker}</HudLabel>
          <h2
            id="auth-aside-heading"
            className="font-display text-display-l uppercase text-ink [text-shadow:0_0_22px_rgb(var(--c-pink)/0.4)]"
          >
            {aside.headline}
          </h2>
          <ul className="flex flex-col gap-3">
            {aside.points.map((point) => (
              <li key={point} className="flex gap-3 text-body text-ink/90">
                <span aria-hidden="true" className="text-pink">
                  ▸
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 border-t border-bezel/70 pt-5">
          <p className="text-small text-ink-muted">
            Just here to play? No account needed.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ButtonLink href={PLAY_RIFFLE_HREF} variant="secondary" arrow>
              Play Riffle
            </ButtonLink>
            <HudLabel tone="amber" as="span">
              Free play
            </HudLabel>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AuthScreen({
  title,
  subtitle,
  children,
  width = "form",
  kind = "sign-in",
  success,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  width?: "form" | "account";
  kind?: AuthScreenKind;
  success?: string;
}) {
  const config = screens[kind];
  const panelWidth =
    width === "account" ? "lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]";

  return (
    <SiteShell>
      <Frame className="py-8 lg:py-14">
        <div className={`grid gap-6 lg:gap-8 ${panelWidth}`}>
          <section
            aria-labelledby="auth-heading"
            className="cabinet t-molding flex flex-col gap-6 p-4 sm:p-7"
            style={{ "--molding": "rgb(var(--c-pink))" } as CSSProperties}
          >
            <MarqueeStrip>
              <HudLabel tone="amber" as="span">
                Player 1
              </HudLabel>
              <HudLabel tone="muted" as="span">
                {config.marquee}
              </HudLabel>
            </MarqueeStrip>

            {config.flow ? <Steps flow={config.flow} done={Boolean(success)} /> : null}

            <div className="flex flex-col gap-3">
              {success ? (
                <span className="inline-flex items-center gap-2 self-start rounded-sm border border-success/70 bg-success/10 px-2 py-1 font-hud text-hud uppercase text-success">
                  <span aria-hidden="true">✓</span>
                  {success}
                </span>
              ) : null}
              <h1
                id="auth-heading"
                className="font-display text-title uppercase text-ink"
              >
                {title}
              </h1>
              {subtitle ? (
                <div className="text-body text-ink-muted">{subtitle}</div>
              ) : null}
            </div>

            {children}
          </section>

          <AttractScreen kind={kind} />
        </div>
      </Frame>
    </SiteShell>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border-2 border-danger bg-danger/10 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-danger font-display text-[13px] text-void"
      >
        !
      </span>
      <p role="alert" className="font-semibold text-ink">
        {children}
      </p>
    </div>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-cyan/60 bg-cyan/10 px-4 py-3">
      <span aria-hidden="true" className="font-display text-[13px] text-cyan">
        i
      </span>
      <p role="status" className="text-small text-ink">
        {children}
      </p>
    </div>
  );
}

export function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="-mt-3 text-left text-small text-ink-muted">
      {children}
    </p>
  );
}

export function TextField({
  id,
  label,
  type,
  value,
  onChange,
  error,
  describedBy,
  autoComplete,
  placeholder,
  onBlur,
  maxLength,
  spellCheck,
  autoCapitalize,
}: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  describedBy?: string;
  autoComplete?: string;
  placeholder?: string;
  onBlur?: () => void;
  maxLength?: number;
  spellCheck?: boolean;
  autoCapitalize?: "off" | "none" | "sentences" | "words" | "characters";
}) {
  const errorId = `${id}-error`;
  const described = [describedBy, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <label htmlFor={id} className="text-label font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        maxLength={maxLength}
        spellCheck={spellCheck}
        autoCapitalize={autoCapitalize}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={`min-h-12 w-full rounded-md border-2 bg-void px-4 text-body text-ink shadow-[inset_0_2px_8px_rgb(0_0_0/0.55)] transition duration-quick placeholder:text-ink-muted focus:shadow-glow-cyan focus-visible:rounded-md focus-visible:outline-offset-2 ${
          error
            ? "border-danger focus:border-danger"
            : "border-bezel hover:border-bezel-hi focus:border-cyan"
        }`}
      />
      {error ? (
        <p
          id={errorId}
          className="flex items-center gap-2 text-small font-semibold text-danger before:flex before:size-5 before:shrink-0 before:items-center before:justify-center before:rounded-sm before:bg-danger before:font-display before:text-[11px] before:text-void before:content-['!']"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pending = false,
}: {
  children: ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonClass("primary", "lg", "relative mt-1 w-full overflow-hidden")}
    >
      {pending ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden">
          <span className="block h-full w-1/3 bg-void/50 motion-safe:animate-[busy-bar_0.9s_linear_infinite]" />
        </span>
      ) : null}
      {children}
    </button>
  );
}

export function TextAction({
  children,
  onClick,
  pending = false,
  variant = "ghost",
}: {
  children: ReactNode;
  onClick: () => void;
  pending?: boolean;
  variant?: "ghost" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={buttonClass(variant, "md", "self-start disabled:opacity-60")}
    >
      {children}
    </button>
  );
}
