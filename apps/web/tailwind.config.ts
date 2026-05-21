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
        glow: "0 0 48px -10px rgba(141, 255, 181, 0.45)",
        panel: "0 8px 40px -12px rgba(0, 0, 0, 0.75)",
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
