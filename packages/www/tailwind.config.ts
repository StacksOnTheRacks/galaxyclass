import type { Config } from "tailwindcss";

// Every value maps to a CSS custom property in globals.css so the tokens live
// in one place and stay usable from plain CSS (backdrops, keyframes).
const channel = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const gc = (name: string) => `rgb(var(--gc-${name}) / <alpha-value>)`;

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
        accent: {
          DEFAULT: channel("accent"),
          ink: channel("accent-ink"),
        },
        mark: channel("mark"),
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
        whodunit: {
          DEFAULT: channel("whodunit"),
          brass: channel("whodunit-brass"),
          night: channel("whodunit-night"),
        },
        suit: {
          red: channel("suit-red"),
          black: channel("suit-black"),
        },
        // Studio "Deep Field" tokens (additive). Channels live in styles/studio.css.
        gc: {
          void: gc("void"),
          deep: gc("deep"),
          hull: gc("hull"),
          "hull-2": gc("hull-2"),
          rule: gc("rule"),
          "rule-2": gc("rule-2"),
          ink: gc("ink"),
          "ink-2": gc("ink-2"),
          "ink-3": gc("ink-3"),
          solar: gc("solar"),
          flare: gc("flare"),
          ember: gc("ember"),
          stellar: gc("stellar"),
          nebula: gc("nebula"),
          rose: gc("rose"),
          danger: gc("danger"),
          success: gc("success"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        hud: ["var(--font-hud)", "ui-monospace", "monospace"],
        "gc-display": ["var(--font-anybody)", "system-ui", "sans-serif"],
        "gc-serif": ["var(--font-instrument)", "Georgia", "serif"],
        "gc-sans": ["var(--font-geist)", "system-ui", "sans-serif"],
        "gc-mono": ["var(--font-geist-mono)", "ui-monospace", "monospace"],
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
        "gc-mega": [
          "clamp(3.5rem, 1rem + 11vw, 11rem)",
          { lineHeight: "0.86", letterSpacing: "-0.02em" },
        ],
        "gc-d1": [
          "clamp(2.75rem, 1.2rem + 6vw, 6.5rem)",
          { lineHeight: "0.92", letterSpacing: "-0.015em" },
        ],
        "gc-d2": [
          "clamp(2.25rem, 1.3rem + 3.6vw, 4.5rem)",
          { lineHeight: "0.98", letterSpacing: "-0.01em" },
        ],
        "gc-d3": [
          "clamp(1.75rem, 1.2rem + 2vw, 2.75rem)",
          { lineHeight: "1.05", letterSpacing: "-0.005em" },
        ],
        "gc-statement": [
          "clamp(1.75rem, 1rem + 3vw, 3.75rem)",
          { lineHeight: "1.15", letterSpacing: "-0.01em" },
        ],
        "gc-serif-xl": [
          "clamp(1.75rem, 1rem + 2.6vw, 3.25rem)",
          { lineHeight: "1.1", letterSpacing: "0" },
        ],
        "gc-lead": [
          "clamp(1.125rem, 1rem + 0.45vw, 1.375rem)",
          { lineHeight: "1.55", letterSpacing: "0" },
        ],
        "gc-body": ["1rem", { lineHeight: "1.65", letterSpacing: "0" }],
        "gc-small": ["0.875rem", { lineHeight: "1.5", letterSpacing: "0" }],
        "gc-mono": ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.18em" }],
        "gc-mono-s": ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.22em" }],
      },
      spacing: {
        gutter: "var(--space-gutter)",
        section: "var(--space-section)",
        tabbar: "var(--size-tabbar)",
        "gc-gutter": "var(--gc-gutter)",
        "gc-section": "var(--gc-space-section)",
        "gc-nav": "var(--gc-nav-h)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        screen: "var(--radius-screen)",
        button: "var(--radius-button)",
        "gc-xs": "2px",
        "gc-sm": "4px",
        "gc-md": "8px",
        "gc-lg": "14px",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        raised: "var(--shadow-raised)",
        press: "var(--shadow-press)",
        "press-down": "var(--shadow-press-down)",
        screen: "var(--shadow-screen)",
        "glow-cyan": "var(--glow-cyan)",
        "glow-pink": "var(--glow-pink)",
        "glow-mark": "var(--glow-mark)",
        "glow-riffle": "var(--glow-riffle)",
        "glow-scribble": "var(--glow-scribble)",
        "glow-warships": "var(--glow-warships)",
        "glow-whodunit": "var(--glow-whodunit)",
        "gc-1": "var(--gc-shadow-1)",
        "gc-2": "var(--gc-shadow-2)",
        "gc-glow-solar": "var(--gc-glow-solar)",
        "gc-glow-stellar": "var(--gc-glow-stellar)",
      },
      maxWidth: {
        frame: "var(--size-frame)",
        "gc-frame": "90rem",
        "gc-measure": "62ch",
      },
      transitionDuration: {
        quick: "var(--motion-quick)",
        base: "var(--motion-base)",
        "gc-1": "var(--gc-dur-1)",
        "gc-2": "var(--gc-dur-2)",
        "gc-3": "var(--gc-dur-3)",
        "gc-4": "var(--gc-dur-4)",
        "gc-5": "var(--gc-dur-5)",
      },
      transitionTimingFunction: {
        snap: "var(--ease-snap)",
        "gc-out": "var(--gc-ease-out)",
        "gc-in-out": "var(--gc-ease-in-out)",
        "gc-snap": "var(--gc-ease-snap)",
      },
      zIndex: {
        "gc-nav": "50",
        "gc-grain": "60",
      },
    },
  },
  plugins: [],
};

export default config;
