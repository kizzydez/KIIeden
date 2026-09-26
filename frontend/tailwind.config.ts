import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        base: {
          950: "#050409",
          900: "#0b0813",
          850: "#110c1d",
          800: "#171126",
          700: "#211836",
          600: "#2d2249",
        },
        accent: {
          300: "#d2b8ff",
          400: "#b58cff",
          500: "#9b5cff",
          600: "#8339ff",
          700: "#6a1fe0",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,57,255,0.35), 0 8px 30px rgba(139,57,255,0.15)",
        "glow-lg": "0 0 0 1px rgba(155,92,255,0.5), 0 20px 60px rgba(131,57,255,0.35)",
        soft: "0 10px 40px -10px rgba(0,0,0,0.7)",
      },
    },
  },
  plugins: [],
};
export default config;
