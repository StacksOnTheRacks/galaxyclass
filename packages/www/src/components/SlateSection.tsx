import {
  Eyebrow,
  Frame,
  PLAY_RIFFLE_HREF,
  SIGN_UP_HREF,
  Tag,
  TextLink,
} from "./primitives";

export function SlateSection() {
  return (
    <section aria-labelledby="slate-heading" className="pb-20">
      <Frame className="flex flex-col gap-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4">
            <Eyebrow>On the slate</Eyebrow>
            <h2
              id="slate-heading"
              className="font-display text-heading-m font-bold"
            >
              One table live. More on the way.
            </h2>
          </div>
          <p className="text-body-m text-fg-muted">
            Riffle is the first of the Galaxy Class games.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-2">
          <li className="flex flex-col items-start gap-6 rounded-xl border border-line bg-surface p-10">
            <div className="flex w-full items-center justify-between gap-4">
              <Eyebrow tone="muted">Card game · Browser</Eyebrow>
              <Tag status="live" />
            </div>
            <h3 className="font-display text-heading-m font-bold">Riffle</h3>
            <p className="text-body-m text-fg-muted">
              No-limit Hold&rsquo;em for friends. Play chips only.
            </p>
            <TextLink href={PLAY_RIFFLE_HREF} arrow>
              Play Riffle
            </TextLink>
          </li>

          <li className="flex flex-col items-start gap-6 rounded-xl border border-dashed border-line bg-surface p-10">
            <div className="flex w-full items-center justify-between gap-4">
              <Eyebrow tone="muted">Game 02</Eyebrow>
              <Tag status="lab" />
            </div>
            <h3 className="font-display text-heading-m font-bold">Next table</h3>
            <p className="text-body-m text-fg-muted">
              Something new is on the felt. Create an account to hear first
              when it opens.
            </p>
            <TextLink href={SIGN_UP_HREF} arrow>
              Get notified
            </TextLink>
          </li>
        </ul>
      </Frame>
    </section>
  );
}
