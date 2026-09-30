"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AVATAR_IDS, avatarUrl } from "@galaxyclass/accounts/avatars";
import { buttonClass } from "@/components/primitives";
import { FormAlert, FormNotice } from "@/components/auth/ui";
import { ProfileApiError, saveAvatar, type Profile } from "@/lib/profile/api";
import { PROFILE_COPY, profileSaveError } from "@/lib/profile/messages";
import { Avatar } from "./Avatar";

/**
 * Native radio group (one tab stop, arrow keys move the choice) styled as an
 * avatar grid. Choosing only previews; Save persists to the profile API.
 */
export function AvatarPicker({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [selected, setSelected] = useState(profile.avatarId);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    const chosen = grid?.querySelector<HTMLElement>(`[data-avatar-id="${profile.avatarId}"]`);
    if (grid && chosen) {
      grid.scrollTop = Math.max(0, chosen.offsetTop - grid.offsetTop - 8);
    }
    // Only on first paint: keep the saved avatar in view without fighting the user's scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = selected !== profile.avatarId;

  async function save() {
    setPending(true);
    setNotice("");
    setError("");
    try {
      onSaved(await saveAvatar(selected));
      setNotice(PROFILE_COPY.avatarSaved);
    } catch (caught) {
      setError(profileSaveError(caught instanceof ProfileApiError ? caught.code : "unavailable"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 text-label font-semibold text-ink">Choose an avatar</legend>
        <div className="flex items-center gap-4 rounded-md border border-bezel bg-floor p-3">
          <Avatar avatarId={selected} size="md" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-hud text-hud uppercase text-ink-muted">
              {dirty ? "Preview" : "Current"}
            </span>
            <span className="text-small font-semibold text-ink">Avatar {selected}</span>
          </div>
        </div>
        <div
          ref={gridRef}
          className="max-h-[18.5rem] overflow-y-auto rounded-md border-2 border-bezel bg-void p-2 shadow-[inset_0_2px_8px_rgb(0_0_0/0.55)]"
        >
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
            {AVATAR_IDS.map((id) => {
              const checked = id === selected;
              return (
                <label
                  key={id}
                  data-avatar-id={id}
                  className="group relative block cursor-pointer"
                >
                  <input
                    type="radio"
                    name="avatar"
                    value={id}
                    checked={checked}
                    onChange={() => {
                      setSelected(id);
                      setNotice("");
                    }}
                    aria-label={`Avatar ${id}`}
                    className="peer sr-only"
                  />
                  <Image
                    src={avatarUrl(id)}
                    alt=""
                    width={72}
                    height={72}
                    loading="lazy"
                    className="aspect-square w-full rounded-sm border-2 border-transparent bg-floor object-cover transition duration-quick group-hover:border-bezel-hi peer-checked:border-pink peer-checked:shadow-glow-pink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan"
                  />
                  {checked ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-sm bg-pink font-display text-[11px] text-void"
                    >
                      ✓
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      </fieldset>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {notice ? <FormNotice>{notice}</FormNotice> : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!dirty || pending}
        aria-busy={pending || undefined}
        className={buttonClass("primary", "md", "self-start disabled:opacity-60")}
      >
        {pending ? PROFILE_COPY.saving : "Save avatar"}
      </button>
    </div>
  );
}
