import { Eyebrow, Frame } from "./primitives";

const pillars = [
  {
    index: "01",
    title: "Functional first",
    body: "Every screen earns its place. Join in seconds and understand the table at a glance.",
  },
  {
    index: "02",
    title: "Fun always",
    body: "Motion, texture, and a little swagger — never at the cost of clarity.",
  },
  {
    index: "03",
    title: "Social by default",
    body: "Share a link, pull up a seat. Play chips only: no cashier, no wallet, no catch.",
  },
];

export function StudioSection() {
  return (
    <section id="studio" aria-labelledby="studio-heading" className="py-20">
      <Frame className="flex flex-col gap-12">
        <div className="flex max-w-[760px] flex-col gap-4">
          <Eyebrow>The studio</Eyebrow>
          <h2
            id="studio-heading"
            className="font-display text-[40px] font-bold leading-[44px] tracking-[-0.8px] sm:text-display-l"
          >
            Built for the people at your table.
          </h2>
          <p className="text-body-l text-fg-muted">
            Galaxy Class Gaming is an independent studio. We skip the costly
            spectacle and put the craft where you feel it: fast joins, clear
            rules, and moments worth sharing.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <li
              key={pillar.index}
              className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-8 pb-10 pt-8"
            >
              <p
                className="font-display text-heading-m font-bold text-gold"
                aria-hidden="true"
              >
                {pillar.index}
              </p>
              <h3 className="font-display text-heading-s font-semibold">
                {pillar.title}
              </h3>
              <p className="text-body-m text-fg-muted">{pillar.body}</p>
            </li>
          ))}
        </ul>
      </Frame>
    </section>
  );
}
