import {
  APHELION_HREF,
  GITHUB_HREF,
  STUDIO_LINKS,
  STUDIO_NAME,
} from "@/content/site";
import { ArrowUpRight } from "./icons";
import { MotionToggle } from "./motion";
import { OutlineWordmark } from "./OutlineWordmark";
import { GcFrame, OrbitRule } from "./ui";

type FooterLink = { href: string; label: string; external?: boolean };

// Link names must stay distinct from page CTAs ("Play Aphelion Run", "Enter The Arcade",
// "The Arcade"). Never link to a game path from here.
const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Games",
    links: [
      { href: APHELION_HREF, label: "Aphelion Run", external: true },
      { href: STUDIO_LINKS.arcade, label: "Arcade" },
    ],
  },
  {
    title: "Studio",
    links: [
      { href: STUDIO_LINKS.about, label: "About" },
      { href: GITHUB_HREF, label: "GitHub", external: true },
    ],
  },
  {
    title: "Account",
    links: [
      { href: STUDIO_LINKS.signIn, label: "Sign in" },
      { href: STUDIO_LINKS.signUp, label: "Create account" },
      { href: STUDIO_LINKS.account, label: "Your account" },
    ],
  },
];

const linkClass =
  "inline-flex min-h-11 items-center gap-1.5 font-gc-sans text-gc-small text-gc-ink-2 transition-colors duration-gc-2 hover:text-gc-ink";

export function StudioFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gc-deep">
      <OrbitRule />
      <GcFrame className="flex flex-col gap-12 pb-8 pt-16 md:pt-24">
        <OutlineWordmark />

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-1">
              <p className="pb-2 font-gc-mono text-gc-mono-s font-medium uppercase text-gc-ink-3">
                {column.title}
              </p>
              <ul className="flex flex-col">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className={linkClass}
                      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {link.label}
                      {link.external ? (
                        <>
                          <span className="sr-only"> (opens in a new tab)</span>
                          <ArrowUpRight className="size-3.5" />
                        </>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-gc-rule pt-6 md:flex-row md:items-center md:justify-between">
          <p className="font-gc-sans text-gc-small text-gc-ink-3">
            © {year} {STUDIO_NAME}
          </p>
          <p className="font-gc-serif text-lg italic text-gc-ink-2">Made in Sol.</p>
          <MotionToggle />
        </div>
      </GcFrame>
    </footer>
  );
}
