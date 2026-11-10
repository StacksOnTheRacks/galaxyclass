import { APHELION_HREF } from "@/content/site";
import { Eyebrow, GcButtonLink, GcFrame, gcType } from "@/components/studio/ui";

/**
 * STUB (WS0). WS3 replaces this with the full cinematic section. Contract kept stable:
 * `id="aphelion-run"`, `aria-labelledby="aphelion-heading"`, and the page's only
 * "Play Aphelion Run" link (external, new tab).
 */
export function AphelionFeature() {
  return (
    <section
      id="aphelion-run"
      aria-labelledby="aphelion-heading"
      className="relative scroll-mt-[var(--gc-nav-h)] bg-gc-deep py-gc-section"
    >
      <GcFrame className="flex flex-col items-start gap-6">
        <Eyebrow>Now in development</Eyebrow>
        <h2 id="aphelion-heading" className={`${gcType.d1} text-gc-ink`}>
          Aphelion Run
        </h2>
        <p className={`${gcType.lead} max-w-[52ch]`}>
          Fly a ship out of your home base in Sol. Mine moons, siphon the Sun’s collectors, sell
          energy on Earth’s black market, and fight for what you haul.
        </p>
        <div id="aphelion-launch">
          <GcButtonLink href={APHELION_HREF} external size="lg">
            Play Aphelion Run
          </GcButtonLink>
        </div>
      </GcFrame>
    </section>
  );
}
