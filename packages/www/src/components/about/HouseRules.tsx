import { HudLabel } from "../primitives";

const rules = [
  {
    glyph: "▶",
    title: "Walk in and play",
    body: "No account needed to sit at a Riffle Poker table. Every room runs in your browser.",
    tone: "text-cyan",
  },
  {
    glyph: "◆",
    title: "One account, every room",
    body: "A free Galaxy Class account carries your gamer tag and avatar into every game.",
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
    <section id="house-rules" aria-labelledby="rules-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <HudLabel tone="amber">House rules</HudLabel>
        <h2 id="rules-heading" className="font-display text-title uppercase">
          How the rooms work
        </h2>
      </div>

      <ol className="panel grid overflow-hidden sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.title}
            className="flex gap-4 border-bezel p-5 [&:not(:last-child)]:border-b sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(odd)]:border-r"
          >
            <span aria-hidden="true" className={`pt-1 text-[14px] leading-none ${rule.tone}`}>
              {rule.glyph}
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-heading font-semibold">{rule.title}</h3>
              <p className="text-small text-ink-muted">{rule.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
