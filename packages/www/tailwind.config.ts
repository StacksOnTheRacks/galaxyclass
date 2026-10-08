import type { Config } from "tailwindcss";

// Every value maps to a CSS custom property in globals.css so the tokens live
// in one place and stay usable from plain CSS (backdrops, keyframes).
const channel = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        void: channel("void"),
        floor: channel("floor"),
        panel: channel("panel"),
        raised: channel("raised"),
        bezel: {
          DEFAULT: channel("bezel"),
          hi: channel("bezel-hi"),
        },
        ink: {
          DEFAULT: channel("ink"),
          muted: channel("ink-muted"),
        },
        cyan: channel("cyan"),
        pink: {
          DEFAULT: channel("pink"),
          deep: channel("pink-deep"),
        },
        amber: channel("amber"),
        danger: channel("danger"),
        success: channel("success"),
        riffle: {
          DEFAULT: channel("riffle"),
          felt: channel("riffle-felt"),
          rail: channel("riffle-rail"),
        },
        scribble: {
          DEFAULT: channel("scribble"),
          tile: channel("scribble-tile"),
          ink: channel("scribble-ink"),
          board: channel("scribble-board"),
        },
        warships: {
          DEFAULT: channel("warships"),
          sea: channel("warships-sea"),
          hit: channel("warships-hit"),
        },
        suit: {
          red: channel("suit-red"),
          black: channel("suit-black"),
        },
      },
      fontFamily: {
        display: ["var(--font-bungee)", "Impact", "system-ui", "sans-serif"],
        body: ["var(--font-chakra)", "system-ui", "sans-serif"],
        hud: ["var(--font-silkscreen)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-l": [
          "clamp(2rem, 1.3rem + 2.6vw, 3.25rem)",
          { lineHeight: "1", letterSpacing: "0.01em" },
        ],
        title: ["clamp(1.5rem, 1.2rem + 1vw, 2rem)", { lineHeight: "1.1" }],
        heading: ["1.25rem", { lineHeight: "1.3" }],
        "body-l": ["1.125rem", { lineHeight: "1.65" }],
        body: ["1rem", { lineHeight: "1.6" }],
        label: ["0.9375rem", { lineHeight: "1.3" }],
        small: ["0.875rem", { lineHeight: "1.45" }],
        hud: ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.08em" }],
      },
      spacing: {
        gutter: "var(--space-gutter)",
        section: "var(--space-section)",
        tabbar: "var(--size-tabbar)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        screen: "var(--radius-screen)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        raised: "var(--shadow-raised)",
        press: "var(--shadow-press)",
        "press-down": "var(--shadow-press-down)",
        screen: "var(--shadow-screen)",
        "glow-cyan": "var(--glow-cyan)",
        "glow-pink": "var(--glow-pink)",
        "glow-riffle": "var(--glow-riffle)",
        "glow-scribble": "var(--glow-scribble)",
        "glow-warships": "var(--glow-warships)",
      },
      maxWidth: {
        frame: "var(--size-frame)",
      },
      transitionDuration: {
        quick: "var(--motion-quick)",
        base: "var(--motion-base)",
      },
      transitionTimingFunction: {
        snap: "var(--ease-snap)",
      },
    },
  },
  plugins: [],
};

export default config;
