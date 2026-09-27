"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { ButtonLink, Eyebrow, Frame, PLAY_RIFFLE_HREF, Tag } from "./primitives";

const trust = ["Play chips only", "Nothing to install", "Friends first"];

const stats = [
  { label: "Stakes", value: "Play chips" },
  { label: "Seats", value: "Open" },
  { label: "Install", value: "None" },
];

function HeroCards() {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return (
      <>
        <PlayingCard rank="A" suit="spade" className="!absolute left-[316px] top-[30px]" />
        <PlayingCard rank="K" suit="heart" className="!absolute left-[440px] top-[30px]" />
      </>
    );
  }

  return (
    <>
      <motion.div
        data-motion="float"
        className="absolute left-[343px] top-[9px]"
        style={{ rotate: -10 }}
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <PlayingCard rank="A" suit="spade" />
      </motion.div>
      <motion.div
        data-motion="float"
        className="absolute left-[409px] top-[67px]"
        style={{ rotate: 8 }}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <PlayingCard rank="K" suit="heart" />
      </motion.div>
    </>
  );
}

function NowPlayingCard() {
  return (
    <div className="relative flex w-full flex-col gap-6 rounded-xl border border-line bg-surface p-8 shadow-[0px_32px_80px_0px_rgba(0,0,0,0.5)] backdrop-blur-[12px] xl:absolute xl:left-[60px] xl:top-[170px] xl:w-[420px]">
      <div className="flex items-center justify-between">
        <Eyebrow tone="muted">Now playing</Eyebrow>
        <Tag status="live" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-display text-display-l font-bold">Riffle</p>
        <p className="text-body-m text-fg-muted">
          No-limit Hold&rsquo;em with your people.
        </p>
      </div>
      <div className="h-px w-full bg-line" />
      <dl className="flex justify-between gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-[2px]">
            <dt className="text-eyebrow font-semibold uppercase text-fg-muted">
              {stat.label}
            </dt>
            <dd className="font-display text-heading-s font-semibold">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="py-16 lg:py-24">
      <Frame className="flex flex-col items-center justify-between gap-16 xl:flex-row">
        <div className="flex w-full max-w-[640px] flex-col items-start gap-8 self-start xl:self-auto">
          <Eyebrow>Galaxy Class Gaming · Independent studio</Eyebrow>

          <h1
            id="hero-heading"
            className="font-display text-[48px] font-bold leading-[52px] tracking-[-1px] sm:text-display-xl"
          >
            Games worth <span className="text-gold">sitting down for.</span>
          </h1>

          <p className="text-body-l text-fg-muted">
            We make social games that are functional first and fun always —
            quick to join, easy to share, and never a wallet in disguise. Our
            first table is Riffle.
          </p>

          <div className="flex flex-wrap gap-3">
            <ButtonLink href={PLAY_RIFFLE_HREF} arrow>
              Play Riffle
            </ButtonLink>
            <ButtonLink href="#studio" variant="secondary">
              Meet the studio
            </ButtonLink>
          </div>

          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {trust.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-label font-semibold text-fg-muted"
              >
                <Image
                  src="/figma/trust-dot.svg"
                  alt=""
                  width={6}
                  height={6}
                  unoptimized
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative w-full max-w-[560px] self-start xl:size-[560px] xl:shrink-0 xl:self-auto">
          <div className="hidden xl:block" aria-hidden="true">
            <Image
              src="/figma/orbit-outer.svg"
              alt=""
              width={560}
              height={560}
              unoptimized
              className="absolute left-0 top-0"
            />
            <Image
              src="/figma/orbit-inner.svg"
              alt=""
              width={400}
              height={400}
              unoptimized
              className="absolute left-20 top-20"
            />
            <HeroCards />
          </div>

          <NowPlayingCard />

          <Image
            src="/figma/planet.svg"
            alt=""
            width={144}
            height={144}
            unoptimized
            className="absolute left-[-20px] top-[400px] hidden max-w-none xl:block"
          />
        </div>
      </Frame>
    </section>
  );
}
