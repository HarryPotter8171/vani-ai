import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'background-elevated': 'var(--background-elevated)',
        foreground: 'var(--foreground)',
        primary: 'var(--primary)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        border: 'var(--border)',
        glass: 'var(--glass)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        xs: 'var(--radius-xs)',
        pill: 'var(--radius-pill)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
      boxShadow: {
        glass: 'var(--glass-shadow)',
        'glass-lg': 'var(--glass-shadow-lg)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.23, 1, 0.32, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
