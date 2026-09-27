import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        void: "#030308",
        deep: "#0a0618",
        surface: "#120a24",
        elevated: "#1a1035",
        line: "#2c2552",
        fg: {
          DEFAULT: "#f5f7ff",
          muted: "#a09bc0",
        },
        gold: {
          DEFAULT: "#e8c547",
          dim: "#b8942e",
        },
        stellar: "#64d2ff",
        riffle: "#3ee8a5",
        suit: {
          red: "#de3340",
          black: "#0d0d1a",
        },
      },
      fontFamily: {
        display: ["var(--font-syne)", "system-ui", "sans-serif"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["80px", { lineHeight: "84px", letterSpacing: "-1.6px" }],
        "display-l": ["56px", { lineHeight: "60px", letterSpacing: "-1.12px" }],
        "heading-m": ["32px", { lineHeight: "38px", letterSpacing: "-0.32px" }],
        "heading-s": ["22px", { lineHeight: "28px", letterSpacing: "-0.11px" }],
        "body-l": ["20px", { lineHeight: "32px" }],
        "body-m": ["16px", { lineHeight: "26px" }],
        label: ["15px", { lineHeight: "20px" }],
        eyebrow: ["13px", { lineHeight: "16px", letterSpacing: "2.86px" }],
      },
      borderRadius: {
        md: "10px",
        xl: "24px",
      },
      maxWidth: {
        frame: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
