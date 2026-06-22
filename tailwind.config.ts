import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Stratus brand — deep slate ink + signal colors
        ink: {
          DEFAULT: "#13202E",
          soft: "#1C2E40",
          muted: "#5A6B7B",
        },
        paper: "#F7F8FA",
        // Scorecard signal palette (status-driven)
        signal: {
          green: "#1F9D6E",
          greenbg: "#E6F5EF",
          amber: "#D99315",
          amberbg: "#FBF1DD",
          red: "#D24B4B",
          redbg: "#FAE7E7",
        },
        accent: "#2E6BE6",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
