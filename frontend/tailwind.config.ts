import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        background: "var(--bg)",
        foreground: "var(--fg)",
        muted: {
          DEFAULT: "var(--fg-muted)",
          foreground: "var(--fg-muted)",
        },
        subtle: "var(--fg-subtle)",
        surface: {
          DEFAULT: "var(--surface)",
          elevated: "var(--surface-elevated)",
          glass: "var(--surface-glass)",
          hover: "var(--surface-hover)",
          input: "var(--surface-input)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
          glow: "var(--border-glow)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          muted: "var(--primary-muted)",
          glow: "var(--primary-glow)",
          50: "var(--primary-50)",
          100: "var(--primary-100)",
          200: "var(--primary-200)",
          300: "var(--primary-300)",
          400: "var(--primary-400)",
          500: "var(--primary-500)",
          600: "var(--primary-600)",
          700: "var(--primary-700)",
          800: "var(--primary-800)",
          900: "var(--primary-900)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
          muted: "var(--accent-muted)",
          glow: "var(--accent-glow)",
          300: "var(--accent-300)",
          400: "var(--accent-400)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          glow: "var(--destructive-glow)",
        },
        success: {
          DEFAULT: "var(--success)",
          glow: "var(--success-glow)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          glow: "var(--warning-glow)",
        },
        ring: "var(--ring)",
        cat: {
          trigger: "var(--cat-trigger)",
          logic: "var(--cat-logic)",
          llm: "var(--cat-llm)",
          data: "var(--cat-data)",
          integration: "var(--cat-integration)",
          quality: "var(--cat-quality)",
          flow: "var(--cat-flow)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        "elev-1": "var(--elev-1)",
        "elev-2": "var(--elev-2)",
        "elev-3": "var(--elev-3)",
        "glow-primary": "var(--elev-glow-primary)",
        "glow-accent": "var(--elev-glow-accent)",
        "glow-success": "var(--elev-glow-success)",
        "glow-destructive": "var(--elev-glow-destructive)",
        "glow-warning": "var(--elev-glow-warning)",
      },
      fontSize: {
        "2xs": ["10px", "14px"],
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        "out-soft": "var(--ease-out)",
        "in-out-soft": "var(--ease-in-out)",
      },
      transitionDuration: {
        instant: "120ms",
        fast: "200ms",
        base: "320ms",
        slow: "500ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "stagger-fade": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "var(--elev-glow-primary)" },
          "50%": { boxShadow: "0 0 0 1px rgba(99,102,241,0.35), 0 0 48px rgba(99,102,241,0.3)" },
        },
        "glow-pulse-warning": {
          "0%, 100%": { boxShadow: "var(--elev-glow-warning)" },
          "50%": { boxShadow: "0 0 0 1px rgba(245,158,11,0.4), 0 0 36px rgba(245,158,11,0.32)" },
        },
        "edge-flow": {
          "0%": { strokeDashoffset: "20" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 320ms var(--ease-out) forwards",
        "stagger-fade": "stagger-fade 400ms var(--ease-out) forwards",
        "glow-pulse": "glow-pulse 1.6s var(--ease-in-out) infinite",
        "glow-pulse-warning": "glow-pulse-warning 1.6s var(--ease-in-out) infinite",
        "edge-flow": "edge-flow 1.5s linear infinite",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;