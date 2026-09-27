"use client";

import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export function AuthScreen({
  title,
  subtitle,
  children,
  width = "form",
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  width?: "form" | "account";
}) {
  const max = width === "account" ? "max-w-[420px]" : "max-w-[320px]";

  return (
    <div className="flex min-h-screen flex-col bg-void">
      <Nav />
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className={`flex w-full ${max} flex-col gap-6`}>
          <div className="flex flex-col gap-3 text-center">
            <h1 className="font-display text-[28px] font-bold leading-9 text-fg">
              {title}
            </h1>
            {subtitle ? (
              <div className="text-sm leading-normal text-fg-muted">{subtitle}</div>
            ) : null}
          </div>
          {children}
        </div>
      </main>
    </div>
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
}) {
  const errorId = `${id}-error`;
  const described = [describedBy, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <label htmlFor={id} className="text-label font-semibold text-fg">
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
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-md bg-surface px-4 py-3 text-body-m text-fg placeholder:text-fg-muted ${
          error ? "border-2 border-[#ff6b6b]" : "border border-line"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-body-m text-[#ff6b6b]">
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
      className="inline-flex items-center justify-center self-center rounded-full bg-gold px-6 py-3 text-label font-semibold text-void transition hover:bg-gold/90 disabled:opacity-80"
    >
      {children}
    </button>
  );
}

export function TextAction({
  children,
  onClick,
  pending = false,
}: {
  children: ReactNode;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="self-center text-label font-semibold text-fg underline-offset-4 transition hover:underline disabled:opacity-80"
    >
      {children}
    </button>
  );
}
