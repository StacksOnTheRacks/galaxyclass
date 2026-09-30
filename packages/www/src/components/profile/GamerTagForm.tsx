"use client";

import { useState, type FormEvent } from "react";
import { GAMER_TAG_MESSAGES, validateGamerTag } from "@galaxyclass/accounts/gamer-tag";
import { buttonClass } from "@/components/primitives";
import { FormAlert, FormNotice } from "@/components/auth/ui";
import { ProfileApiError, saveGamerTag, type Profile } from "@/lib/profile/api";
import { PROFILE_COPY, profileSaveError } from "@/lib/profile/messages";
import { GamerTagField } from "./GamerTagField";

export function GamerTagForm({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [value, setValue] = useState(profile.gamerTag ?? "");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const tag = validateGamerTag(value);
    if (!tag.ok) {
      setFieldError(GAMER_TAG_MESSAGES[tag.error]);
      return;
    }
    if (tag.value === profile.gamerTag) {
      setFieldError("");
      return;
    }

    setPending(true);
    try {
      const saved = await saveGamerTag(tag.value);
      setValue(saved.gamerTag ?? tag.value);
      setFieldError("");
      setNotice(PROFILE_COPY.tagSaved);
      onSaved(saved);
    } catch (error) {
      const code = error instanceof ProfileApiError ? error.code : "unavailable";
      if (code === "taken") {
        setFieldError(GAMER_TAG_MESSAGES.taken);
      } else if (code === "invalid" && error instanceof ProfileApiError && error.reason) {
        setFieldError(GAMER_TAG_MESSAGES[error.reason]);
      } else {
        setFormError(profileSaveError(code));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      <GamerTagField
        id="account-gamer-tag"
        value={value}
        onChange={(next) => {
          setValue(next);
          setFieldError("");
          setNotice("");
        }}
        error={fieldError}
        currentTag={profile.gamerTag}
      />
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      {notice ? <FormNotice>{notice}</FormNotice> : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={buttonClass("primary", "md", "-mt-2 self-start disabled:opacity-60")}
      >
        {pending ? PROFILE_COPY.saving : profile.gamerTag ? "Save gamer tag" : "Set gamer tag"}
      </button>
    </form>
  );
}
