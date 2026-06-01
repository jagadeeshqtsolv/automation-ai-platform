import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        midnight: {
          950: "#020405",
          900: "#050a0c",
          800: "#0a1114",
          700: "#111a1f",
          600: "#1a262d",
        },
        ink: {
          950: "#020405",
          900: "#050a0c",
          800: "#0a1114",
          700: "#111a1f",
        },
        accent: {
          DEFAULT: "#8dffb5",
          dim: "#6ae89a",
          muted: "#b8ffd4",
          foreground: "#020405",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      boxShadow: {
        glow: "0 0 32px -8px rgba(141, 255, 181, 0.35)",
        panel: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        card: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        xs: "0 1px 2px rgba(0,0,0,0.05)",
        md: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.35s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
