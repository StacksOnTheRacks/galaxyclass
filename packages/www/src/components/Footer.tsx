import { ABOUT_HREF, Frame, HudLabel, ROOMS_HREF } from "./primitives";

const links = [
  { href: ROOMS_HREF, label: "Rooms" },
  { href: ABOUT_HREF, label: "About" },
];

const linkClass =
  "inline-flex min-h-11 items-center text-ink-muted transition duration-quick hover:text-ink";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-bezel bg-floor/80">
      <Frame className="flex flex-col gap-3 py-6 text-small md:flex-row md:items-center md:justify-between md:gap-6">
        <HudLabel tone="amber" className="order-first md:order-none">
          Social chips only · Nothing to buy · No real-money wagering
        </HudLabel>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 md:justify-end">
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 font-semibold">
              {links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={linkClass}>
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="https://github.com/StacksOnTheRacks/galaxyclass-www"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  GitHub
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
          <p className="text-ink-muted">© {year} Galaxy Class Gaming</p>
        </div>
      </Frame>
    </footer>
  );
}
