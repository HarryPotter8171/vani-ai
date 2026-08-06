/**
 * VANI Design Language v1 — TypeScript token reference.
 * Runtime values live in CSS variables (`app/globals.css`).
 * Components must use semantic tokens / Tailwind mapped classes — never hardcode colors.
 */

export const VANI_SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96] as const;

export const VANI_TYPE = {
  displayXl: 'type-display-xl',
  display: 'type-display',
  heading: 'type-heading',
  title: 'type-title',
  body: 'type-body',
  caption: 'type-caption',
} as const;

export const VANI_ELEVATION = {
  1: 'shadow-1',
  2: 'shadow-2',
  3: 'shadow-3',
  glass: 'shadow-glass',
} as const;

export const VANI_SURFACE = {
  background: 'bg-background',
  surface: 'bg-surface',
  elevated: 'bg-surface-elevated',
  secondary: 'bg-surface-secondary',
  glass: 'bg-surface-glass',
  hover: 'bg-surface-hover',
} as const;

export const VANI_MOTION = {
  fast: 'duration-fast',
  normal: 'duration-normal',
  enter: 'duration-enter',
  ease: 'ease-apple',
  spring: 'ease-spring',
} as const;

export const VANI_ACCENT = {
  /** Brand purple/indigo — never replace with blue */
  default: 'accent',
  hover: 'accent-hover',
  muted: 'accent-muted',
} as const;
