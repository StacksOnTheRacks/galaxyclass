import {
  Frame,
  Logo,
  PLAY_RIFFLE_HREF,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
} from "./primitives";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line py-12">
      <Frame className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-8 gap-y-3 text-label font-semibold text-fg-muted">
              <li>
                <a href={PLAY_RIFFLE_HREF} className="transition hover:text-fg">
                  Riffle
                </a>
              </li>
              <li>
                <a href={SIGN_IN_HREF} className="transition hover:text-fg">
                  Sign in
                </a>
              </li>
              <li>
                <a href={SIGN_UP_HREF} className="transition hover:text-fg">
                  Sign up
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/StacksOnTheRacks/galaxyclass-www"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-fg"
                >
                  GitHub
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 text-body-m text-fg-muted md:flex-row md:justify-between">
          <p>© {year} Galaxy Class Gaming</p>
          <p>Play chips only. No real-money gambling.</p>
        </div>
      </Frame>
    </footer>
  );
}
