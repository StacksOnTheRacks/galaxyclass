import { HudLabel } from "./primitives";

const sections = [
  { href: "#featured", label: "Featured", glyph: "★" },
  { href: "#library", label: "All games", glyph: "▦" },
  { href: "#how-it-works", label: "House rules", glyph: "§" },
  { href: "#studio", label: "Studio", glyph: "◎" },
  { href: "#player-card", label: "Player card", glyph: "◆" },
];

export function LibraryRail() {
  return (
    <nav
      aria-label="Library sections"
      className="min-w-0 lg:sticky lg:top-[100px] lg:self-start"
    >
      <HudLabel tone="muted" className="mb-3 hidden lg:block">
        Arcade
      </HudLabel>
      <ul className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {sections.map((section) => (
          <li key={section.href} className="shrink-0">
            <a
              href={section.href}
              className="flex min-h-11 items-center gap-3 rounded-md border border-bezel bg-floor px-3 text-small font-semibold text-ink-muted transition duration-quick hover:border-cyan hover:text-ink lg:border-transparent lg:bg-transparent lg:hover:bg-panel"
            >
              <span aria-hidden="true" className="w-4 text-center text-cyan">
                {section.glyph}
              </span>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
