import { HudLabel } from "./primitives";

const rules = [
  {
    glyph: "▶",
    title: "Walk in and play",
    body: "No account needed to sit down at a public game. Everything runs in the browser.",
    tone: "text-cyan",
  },
  {
    glyph: "◆",
    title: "One account, every game",
    body: "A free Galaxy Class account works across all of our games.",
    tone: "text-pink",
  },
  {
    glyph: "▣",
    title: "Private tables",
    body: "Registered players can start private, invite-only games for friends and family.",
    tone: "text-amber",
  },
  {
    glyph: "●",
    title: "Social chips only",
    body: "Nothing to buy. No real-money wagering, no cashier, no KYC.",
    tone: "text-success",
  },
];

export function HouseRules() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="rules-heading"
      className="cabinet overflow-hidden"
    >
      <div className="grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="flex flex-col justify-between gap-4 border-b border-bezel bg-raised/60 p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-2">
            <HudLabel tone="amber">Posted by the door</HudLabel>
            <h2 id="rules-heading" className="font-display text-title uppercase">
              House rules
            </h2>
          </div>
          <p className="text-small text-ink-muted">
            How play works on every Galaxy Class game.
          </p>
        </div>

        <ol className="grid sm:grid-cols-2">
          {rules.map((rule, index) => (
            <li
              key={rule.title}
              className="flex gap-4 border-bezel p-6 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0"
            >
              <span
                aria-hidden="true"
                className={`font-display text-[28px] leading-none ${rule.tone}`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="flex items-center gap-2 text-heading font-semibold">
                  <span aria-hidden="true" className={`text-[14px] ${rule.tone}`}>
                    {rule.glyph}
                  </span>
                  {rule.title}
                </h3>
                <p className="text-small text-ink-muted">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
