/**
 * Shared Framer Motion springs & transitions — VANI Design Language.
 * Prefer these over one-off easing arrays so every surface feels coherent.
 */

export const SPRING = {
  snappy: { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.8 },
  soft: { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.9 },
  gentle: { type: 'spring' as const, stiffness: 280, damping: 28, mass: 1 },
  bouncy: { type: 'spring' as const, stiffness: 420, damping: 22, mass: 0.7 },
  stiff: { type: 'spring' as const, stiffness: 680, damping: 42, mass: 0.7 },
};

export const EASE = {
  apple: [0.25, 0.1, 0.25, 1] as const,
  smooth: [0.16, 1, 0.3, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
  out: [0, 0, 0.2, 1] as const,
};

export const FADE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
};

export const SCALE_IN = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export const DROPDOWN_MOTION = {
  initial: { opacity: 0, y: -4, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -2, scale: 0.98 },
  transition: SPRING.snappy,
};

export const MENU_MOTION = {
  initial: { opacity: 0, scale: 0.94, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 2 },
  transition: SPRING.soft,
};

export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.32, ease: EASE.smooth },
};

export const OVERLAY_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: EASE.apple },
};
