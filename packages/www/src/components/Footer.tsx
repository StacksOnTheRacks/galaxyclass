import {
  Frame,
  HudLabel,
  LIBRARY_HREF,
  Logo,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
  STUDIO_HREF,
} from "./primitives";

const links = [
  { href: LIBRARY_HREF, label: "Library" },
  { href: STUDIO_HREF, label: "Studio" },
  { href: SIGN_IN_HREF, label: "Sign in" },
  { href: SIGN_UP_HREF, label: "Sign up" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-section border-t border-bezel bg-floor">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-pink/70 to-transparent"
      />
      <Frame className="flex flex-col gap-8 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-label font-semibold">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-ink-muted transition duration-quick hover:text-ink"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="https://github.com/StacksOnTheRacks/galaxyclass-www"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-ink-muted transition duration-quick hover:text-ink"
                >
                  GitHub
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-bezel/60 pt-6 text-small text-ink-muted md:flex-row md:items-center md:justify-between">
          <p>© {year} Galaxy Class Gaming</p>
          <HudLabel tone="amber" className="md:text-right">
            Social chips only · Nothing to buy · No real-money wagering
          </HudLabel>
        </div>
      </Frame>
    </footer>
  );
}
