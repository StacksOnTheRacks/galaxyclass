import Image from "next/image";
import { avatarUrl } from "@galaxyclass/accounts/avatars";

const SIZES = {
  sm: { px: 32, className: "size-8 rounded-sm border" },
  md: { px: 64, className: "size-16 rounded-md border-2" },
  lg: { px: 96, className: "size-24 rounded-md border-2" },
} as const;

/** Decorative by default; the player's gamer tag sits beside it as text. */
export function Avatar({
  avatarId,
  size = "md",
  className = "",
}: {
  avatarId: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const spec = SIZES[size];
  return (
    <Image
      src={avatarUrl(avatarId)}
      alt=""
      width={spec.px}
      height={spec.px}
      className={`shrink-0 border-pink/70 bg-void object-cover shadow-glow-pink ${spec.className} ${className}`}
    />
  );
}
