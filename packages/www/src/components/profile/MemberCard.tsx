import { Avatar } from "./Avatar";

export function MemberCard({
  gamerTag,
  avatarId,
  className = "",
}: {
  gamerTag?: string;
  avatarId?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-[1.586] w-full max-w-[22rem] overflow-hidden rounded-lg border-2 border-pink/70 bg-floor p-5 shadow-glow-pink ${className}`}
    >
      <div className="absolute inset-y-0 right-0 w-1/3 bg-[repeating-linear-gradient(135deg,rgb(var(--c-pink)/0.18)_0_10px,transparent_10px_20px)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[14px] text-ink">Galaxy Class</span>
          <span className="rounded-sm bg-cyan px-1.5 py-0.5 font-hud text-hud text-void">
            P1
          </span>
        </div>
        <div className="flex items-end gap-3">
          {avatarId ? <Avatar avatarId={avatarId} size="sm" /> : null}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-hud text-hud uppercase text-ink-muted">Player card</span>
            <span className="truncate font-hud text-[13px] text-ink">
              {gamerTag || "•••• •••• ••••"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
