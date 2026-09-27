"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const glows = [
  {
    src: "/figma/glow-stellar.svg",
    width: 1260,
    height: 980,
    className: "left-[240px] top-[-540px]",
    drift: { x: [0, 40, 0], y: [0, 24, 0] },
    duration: 18,
  },
  {
    src: "/figma/glow-gold.svg",
    width: 920,
    height: 820,
    className: "left-[800px] top-[80px]",
    drift: { x: [0, -32, 0], y: [0, 20, 0] },
    duration: 22,
  },
  {
    src: "/figma/glow-nebula.svg",
    width: 1260,
    height: 1060,
    className: "left-[-420px] top-[720px]",
    drift: { x: [0, 36, 0], y: [0, -28, 0] },
    duration: 26,
  },
];

export function Starfield() {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {reduceMotion ? (
        <Image
          src="/figma/starfield-static.svg"
          alt=""
          width={1436}
          height={3544}
          unoptimized
          className="absolute left-0 top-0 max-w-none"
        />
      ) : (
        <>
          {glows.map((glow) => (
            <motion.div
              key={glow.src}
              data-motion="drift"
              className={`absolute ${glow.className}`}
              animate={glow.drift}
              transition={{
                duration: glow.duration,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Image
                src={glow.src}
                alt=""
                width={glow.width}
                height={glow.height}
                unoptimized
                className="max-w-none"
              />
            </motion.div>
          ))}
          <motion.div
            data-motion="twinkle"
            className="absolute left-0 top-0"
            animate={{ opacity: [1, 0.55, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Image
              src="/figma/starfield.svg"
              alt=""
              width={1436}
              height={3544}
              unoptimized
              className="max-w-none"
            />
          </motion.div>
        </>
      )}
    </div>
  );
}
