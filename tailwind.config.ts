import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Stratus "instrument panel" identity — deep slate ink, warm paper,
        // confident signal blue, and a brass hairline accent.
        ink: {
          DEFAULT: "#0F1822",
          soft: "#1B2A39",
          muted: "#64748B",
        },
        paper: "#FBFBF9",
        surface: "#FFFFFF",
        brass: "#C8B68A",
        signal: {
          green: "#138A5E",
          greenbg: "#E4F4EC",
          amber: "#C8860C",
          amberbg: "#FAEFD6",
          red: "#C73E3E",
          redbg: "#F9E5E5",
        },
        accent: "#3B6FE5",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,24,34,0.04), 0 8px 24px -12px rgba(15,24,34,0.12)",
        lift: "0 2px 4px rgba(15,24,34,0.06), 0 16px 40px -16px rgba(15,24,34,0.20)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
