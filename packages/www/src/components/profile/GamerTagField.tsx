"use client";

import { useRef, useState } from "react";
import {
  GAMER_TAG_MAX_LENGTH,
  GAMER_TAG_MESSAGES,
  GAMER_TAG_RULE,
  gamerTagKey,
  validateGamerTag,
} from "@galaxyclass/accounts/gamer-tag";
import { TextField } from "@/components/auth/ui";
import { checkGamerTag } from "@/lib/profile/api";

type Availability = { tag: string; state: "checking" | "available" | "taken" } | null;

/**
 * Gamer tag input with the shared format rule and an advisory availability
 * check on blur. The server still decides: sign-up and the profile API both
 * enforce uniqueness atomically.
 */
export function GamerTagField({
  id,
  value,
  onChange,
  error,
  currentTag,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** The player's existing tag, which is always "available" to them. */
  currentTag?: string | null;
}) {
  const [availability, setAvailability] = useState<Availability>(null);
  const latest = useRef("");
  const ruleId = `${id}-rule`;
  const statusId = `${id}-availability`;
  const trimmed = value.trim();
  const current = availability && availability.tag === trimmed ? availability : null;

  async function onBlur() {
    const tag = validateGamerTag(value);
    if (!tag.ok || (currentTag && gamerTagKey(currentTag) === tag.key)) {
      setAvailability(null);
      return;
    }
    latest.current = tag.value;
    setAvailability({ tag: tag.value, state: "checking" });
    const result = await checkGamerTag(tag.value);
    if (latest.current !== tag.value) return;
    setAvailability(
      result ? { tag: tag.value, state: result.available ? "available" : "taken" } : null,
    );
  }

  const shownError = error || (current?.state === "taken" ? GAMER_TAG_MESSAGES.taken : "");

  return (
    <div className="flex flex-col gap-6">
      <TextField
        id={id}
        label="Gamer tag"
        type="text"
        value={value}
        onChange={onChange}
        onBlur={() => void onBlur()}
        error={shownError}
        describedBy={`${ruleId} ${statusId}`}
        autoComplete="nickname"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={GAMER_TAG_MAX_LENGTH}
        placeholder="e.g. River_Rat"
      />
      <div className="-mt-3 flex flex-col gap-1 text-left text-small">
        <p id={ruleId} className="text-ink-muted">
          {GAMER_TAG_RULE} Other players see this instead of your email.
        </p>
        <p id={statusId} aria-live="polite" className="min-h-[1.45em]">
          {!shownError && current?.state === "checking" ? (
            <span className="text-ink-muted">Checking availability…</span>
          ) : null}
          {!shownError && current?.state === "available" ? (
            <span className="font-semibold text-success">
              <span aria-hidden="true">✓ </span>
              {current.tag} is available.
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
