import { OrbitMark } from "./icons";

/**
 * Studio wordmark: the orbit monogram plus "GALAXY CLASS" in Anybody 800 at
 * wdth 130. Type only; there is no logo asset. Links home by default; pass
 * `href={null}` to render it as plain text.
 */
export function Wordmark({
  href = "/",
  size = "nav",
  className = "",
}: {
  href?: string | null;
  size?: "nav" | "footer";
  className?: string;
}) {
  const content = (
    <>
      <OrbitMark
        className={size === "nav" ? "size-6 text-gc-solar" : "size-[1.1em] text-gc-solar"}
      />
      <span
        className="font-gc-display font-extrabold uppercase tracking-[0.06em] text-gc-ink [font-variation-settings:'wdth'_130]"
        style={size === "nav" ? { fontSize: "15px" } : { fontSize: "clamp(1.25rem, 1rem + 1.2vw, 2rem)" }}
      >
        Galaxy Class
      </span>
    </>
  );
  const base = `inline-flex items-center gap-2.5 leading-none ${className}`;

  if (href === null) return <span className={base}>{content}</span>;
  return (
    <a href={href} className={`${base} min-h-11 transition-opacity duration-gc-2 hover:opacity-85`}>
      {content}
    </a>
  );
}
