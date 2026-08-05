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
        surface: 'var(--surface)',
        'surface-secondary': 'var(--surface-secondary)',
        'surface-hover': 'var(--surface-hover)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-input': 'var(--surface-input)',
        'surface-glass': 'var(--surface-glass)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-on-accent': 'var(--text-on-accent)',
        border: 'var(--border)',
        'border-subtle': 'var(--border-subtle)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-muted': 'var(--accent-muted)',
        overlay: 'var(--overlay)',
        danger: 'var(--danger)',
        'danger-muted': 'var(--danger-muted)',
        success: 'var(--success)',
        'success-muted': 'var(--success-muted)',
        warning: 'var(--warning)',
        'warning-muted': 'var(--warning-muted)',
        divider: 'var(--divider)',
        /* Aliases */
        'background-elevated': 'var(--surface)',
        foreground: 'var(--text-primary)',
        primary: 'var(--accent)',
        muted: 'var(--text-tertiary)',
        'muted-foreground': 'var(--text-secondary)',
        glass: 'var(--surface-glass)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        xs: 'var(--radius-xs)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        secondary: ['14px', { lineHeight: '1.5', letterSpacing: '-0.014em' }],
        body: ['15px', { lineHeight: '1.55', letterSpacing: '-0.014em' }],
        chat: ['15px', { lineHeight: '1.6', letterSpacing: '-0.014em' }],
        assistant: ['15px', { lineHeight: '1.65', letterSpacing: '-0.014em' }],
        sidebar: ['14px', { lineHeight: '1.45', letterSpacing: '-0.014em' }],
        display: ['40px', { lineHeight: '1.1', letterSpacing: '-0.04em' }],
        heading: ['28px', { lineHeight: '1.2', letterSpacing: '-0.032em' }],
        caption: ['12px', { lineHeight: '1.4', letterSpacing: '-0.008em' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        'glass-lg': 'var(--shadow-3)',
        token: 'var(--shadow-1)',
        'token-lg': 'var(--shadow-3)',
        'token-sm': 'var(--shadow-1)',
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        focus: 'var(--focus-ring)',
      },
      transitionDuration: {
        fast: '140ms',
        normal: '220ms',
        enter: '280ms',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
