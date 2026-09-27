import { AccountBand } from "@/components/AccountBand";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { RiffleFeature } from "@/components/RiffleFeature";
import { SlateSection } from "@/components/SlateSection";
import { Starfield } from "@/components/Starfield";
import { StudioSection } from "@/components/StudioSection";

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      <Starfield />
      <Nav />
      <main>
        <Hero />
        <StudioSection />
        <RiffleFeature />
        <SlateSection />
        <AccountBand />
      </main>
      <Footer />
    </div>
  );
}
