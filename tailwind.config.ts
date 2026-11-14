import type { Config } from "tailwindcss";

/**
 * NSUT Nest design system.
 *
 * Colours are semantic CSS variables so the dark (default) and light themes
 * share the same utility names. See app/styles/tokens.css.
 */
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        nav: "var(--color-nav)",
        foreground: "var(--color-text)",
        muted: "var(--color-muted)",
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
          border: "var(--color-accent-border)",
          contrast: "var(--color-accent-contrast)",
        },
        hero: {
          DEFAULT: "var(--color-hero-bg)",
          border: "var(--color-hero-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          bg: "var(--color-danger-bg)",
          border: "var(--color-danger-border)",
          foreground: "var(--color-danger-text)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          bg: "var(--color-warning-bg)",
          border: "var(--color-warning-border)",
          foreground: "var(--color-warning-text)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        display: [
          "var(--font-inter)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "var(--radius-card)",
        hero: "var(--radius-hero)",
        pill: "9999px",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,.02), 0 12px 32px rgba(0,0,0,.18)",
      },
    },
  },
  plugins: [],
};

export default config;
