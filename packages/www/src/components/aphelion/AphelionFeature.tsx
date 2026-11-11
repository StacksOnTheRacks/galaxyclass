import { ArrowUpRight } from "@/components/studio/icons";
import { Reveal } from "@/components/studio/motion";
import { Eyebrow, GcButtonLink, GcFrame, OrbitRule, gcType } from "@/components/studio/ui";
import { APHELION_BEATS, PROMO_COPY } from "@/content/aphelion-promo";
import { APHELION_HREF, APHELION_RULES_HREF, APHELION_STORY_HREF } from "@/content/site";
import { OrbitBeats } from "./OrbitBeats";
import { PromoStills } from "./PromoStills";
import { StageScale } from "./StageScale";
import styles from "./aphelion.module.css";

function ExternalTextLink({ href, children }: { href: string; children: string }) {
  return (
    <a className={styles.textLink} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <ArrowUpRight />
    </a>
  );
}

/**
 * The home page's Aphelion Run section: gold light on black, a self-drawing orbit, the four
 * beats (Siphon, Mine, Sell, Survive), and framed in-engine stills from the running game.
 *
 * Contract with the home page: `id="aphelion-run"`, `#aphelion-heading`, `#aphelion-launch`,
 * no props, and exactly one primary call to action (an external link, new tab).
 * Status wording is "In development" and "Coming soon". Never "playable now" or "early access".
 */
export function AphelionFeature() {
  const copy = PROMO_COPY;

  return (
    <section
      id="aphelion-run"
      aria-labelledby="aphelion-heading"
      className={`gc-aphelion ${styles.section} scroll-mt-[var(--gc-nav-h)] pb-gc-section pt-gc-section`}
    >
      <div className="absolute inset-x-0 top-0">
        <OrbitRule />
      </div>

      <GcFrame>
        {/* Part A: title lockup and stage */}
        <header className="grid items-end gap-x-[var(--gc-col-gap)] gap-y-8 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <Reveal>
              <Eyebrow className="!text-[color:var(--ar-gold)]">{copy.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal blur delay={60}>
              <h2 id="aphelion-heading" className={`${gcType.d1} ${styles.title}`}>
                {copy.title}
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={`${gcType.serif} ${styles.tagline}`}>{copy.tagline}</p>
            </Reveal>
          </div>
          <Reveal delay={180} className="lg:col-span-5 lg:pb-3">
            <p className={`${gcType.lead} max-w-[52ch]`}>{copy.logline}</p>
          </Reveal>
        </header>

        <div className="mx-auto mt-14 w-full max-md:mx-[calc(1rem-var(--gc-gutter))] max-md:w-auto md:mt-20 md:w-10/12">
          <StageScale>
            <PromoStills />
          </StageScale>
          <p className={`${gcType.small} ${styles.caption} text-gc-ink-3`}>{copy.stage.caption}</p>
        </div>

        {/* Part B: four beats */}
        <div className="mt-gc-section">
          <OrbitBeats beats={APHELION_BEATS} />
        </div>

        {/* Part C: facts, call to action, credit */}
        <div className="mt-16 md:mt-24">
          <Reveal>
            <dl className={styles.facts}>
              {copy.facts.map((fact) => (
                <div key={fact.term} className={styles.fact}>
                  <dt className={`font-gc-mono text-gc-mono font-medium uppercase ${styles.factTerm}`}>
                    {fact.term}
                  </dt>
                  <dd className={styles.factDetail}>{fact.detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <div id="aphelion-launch" className={`${styles.launch} mt-12 scroll-mt-[calc(var(--gc-nav-h)+1.5rem)] md:mt-16`}>
            <GcButtonLink href={APHELION_HREF} external size="lg" className={styles.gold}>
              {copy.cta}
            </GcButtonLink>
            <ExternalTextLink href={APHELION_STORY_HREF}>{copy.storyLink}</ExternalTextLink>
            <ExternalTextLink href={APHELION_RULES_HREF}>{copy.rulesLink}</ExternalTextLink>
            <p className={`font-gc-mono text-gc-mono font-medium uppercase ${styles.status}`}>{copy.status}</p>
          </div>

          <p className="mt-12 font-gc-mono text-gc-mono-s font-medium uppercase text-gc-ink-3">{copy.credit}</p>
        </div>
      </GcFrame>
    </section>
  );
}
