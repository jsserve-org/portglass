import type { Config } from 'tailwindcss';

// Tailwind + shadcn/ui are the default styling stack. Color tokens are bridged
// to the SIGINT design variables defined in app/globals.css so utilities and
// shadcn components share one palette.
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--border-light)',
        ring: 'var(--signal)',
        background: 'var(--bg)',
        foreground: 'var(--text)',
        signal: 'var(--signal)',
        beam: 'var(--beam)',
        amber: 'var(--amber)',
        primary: { DEFAULT: 'var(--signal)', foreground: '#04140b' },
        secondary: { DEFAULT: 'var(--bg-3)', foreground: 'var(--text)' },
        muted: { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-muted)' },
        accent: { DEFAULT: 'var(--bg-3)', foreground: 'var(--beam)' },
        destructive: { DEFAULT: 'var(--red)', foreground: '#ffffff' },
        card: { DEFAULT: 'var(--bg-card)', foreground: 'var(--text)' },
        popover: { DEFAULT: 'var(--bg-card)', foreground: 'var(--text)' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) + 1px)',
        sm: 'var(--radius)',
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
        cond: ['var(--font-cond)'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
