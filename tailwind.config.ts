import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Stratus dark BI theme — deep navy canvas, elevated panels,
        // vivid signal colors that pop on dark, single bright accent.
        canvas: "#0B1120",       // page background (near-black navy)
        panel: "#131C2E",        // card surface
        "panel-2": "#1B2740",    // elevated/hover surface
        hairline: "#26334D",     // borders on dark
        ink: {
          DEFAULT: "#EAF0FB",    // primary text on dark
          soft: "#A9B6CE",       // secondary text
          muted: "#6B7A99",      // tertiary/labels
        },
        accent: "#5B8DEF",       // bright signal blue
        violet: "#8B7CF6",       // secondary accent (gauges)
        signal: {
          green: "#34D399",
          greenbg: "rgba(52,211,153,0.12)",
          amber: "#FBBF24",
          amberbg: "rgba(251,191,36,0.12)",
          red: "#F87171",
          redbg: "rgba(248,113,113,0.12)",
        },
        gold: "#F5C451",         // podium #1
        silver: "#C5CEDD",       // podium #2
        bronze: "#D8965A",       // podium #3
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { card: "16px" },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 12px 32px -16px rgba(0,0,0,0.6)",
        lift: "0 2px 8px rgba(0,0,0,0.4), 0 20px 48px -20px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(91,141,239,0.3), 0 0 24px -4px rgba(91,141,239,0.4)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
