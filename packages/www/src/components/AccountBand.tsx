import {
  ButtonLink,
  Eyebrow,
  Frame,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
  TextLink,
} from "./primitives";

export function AccountBand() {
  return (
    <section aria-labelledby="account-heading" className="pb-20">
      <Frame>
        <div className="flex flex-col items-start justify-between gap-8 rounded-xl border border-line bg-elevated px-8 py-12 lg:flex-row lg:items-center lg:px-16">
          <div className="flex max-w-[640px] flex-col gap-3">
            <Eyebrow tone="gold">Galaxy Class account</Eyebrow>
            <h2
              id="account-heading"
              className="font-display text-heading-m font-bold"
            >
              Save your seat in the studio.
            </h2>
            <p className="text-body-l text-fg-muted">
              One sign-up for Galaxy Class. Keep your name, and be first in line
              when new games open.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TextLink href={SIGN_IN_HREF}>Sign in</TextLink>
            <ButtonLink href={SIGN_UP_HREF}>Sign up</ButtonLink>
          </div>
        </div>
      </Frame>
    </section>
  );
}
