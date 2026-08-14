'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'icon';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'dialog';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows spinner and disables the control. */
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-accent text-text-on-accent',
    'shadow-[0_4px_16px_var(--accent-glow)]',
    'hover:bg-accent-hover hover:shadow-[0_6px_20px_var(--accent-glow)]',
    'active:scale-[0.98]'
  ),
  secondary: cn(
    'border border-border bg-white/70 text-foreground',
    'dark:border-white/[0.08] dark:bg-white/[0.04]',
    'hover:bg-white dark:hover:bg-white/[0.07]',
    'active:scale-[0.98]'
  ),
  ghost: cn(
    'text-foreground/60',
    'hover:bg-surface-hover hover:text-foreground',
    'active:scale-[0.98]'
  ),
  destructive: cn(
    'bg-[#ff3b30] text-white',
    'shadow-[0_6px_20px_rgba(255,59,48,0.35)]',
    'hover:bg-[#ff453a] hover:shadow-[0_8px_28px_rgba(255,59,48,0.45)]',
    'dark:bg-[#ff453a] dark:hover:bg-[#ff6961]',
    'active:scale-[0.98]'
  ),
  icon: cn(
    'text-muted-foreground',
    'hover:bg-surface-hover hover:text-foreground',
    'active:scale-[0.98]'
  ),
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-caption max-md:min-h-[44px] max-md:px-3.5',
  md: 'h-9 gap-1.5 px-4 text-sm max-md:min-h-[44px]',
  lg: 'h-11 gap-2 px-5 text-sidebar max-md:min-h-[48px]',
  dialog: 'h-11 gap-2 px-4 text-sidebar max-md:min-h-[48px]',
};

const iconSizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 p-0 max-md:h-11 max-md:w-11',
  md: 'h-9 w-9 p-0 max-md:h-11 max-md:w-11',
  lg: 'h-11 w-11 p-0',
  dialog: 'h-11 w-11 p-0',
};

/**
 * Shared button primitive — primary / secondary / ghost / destructive / icon.
 * Encodes existing VANI CTA recipes (pill radius, accent tokens, focus via global CSS).
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      className,
      children,
      type = 'button',
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || loading;
    const isIcon = variant === 'icon';

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          'btn-ripple inline-flex shrink-0 items-center justify-center rounded-full',
          'font-medium tracking-[-0.014em]',
          'transition-all duration-fast ease-apple',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClass[variant],
          isIcon ? iconSizeClass[size] : sizeClass[size],
          variant === 'primary' || variant === 'destructive'
            ? 'font-semibold tracking-[-0.016em]'
            : null,
          className
        )}
        {...props}
      >
        {loading ? (
          <Spinner
            size={size === 'sm' ? 13 : size === 'lg' || size === 'dialog' ? 16 : 14}
            tone={
              variant === 'primary' || variant === 'destructive' ? 'inverse' : 'accent'
            }
            label="Loading"
          />
        ) : (
          leftIcon
        )}
        {children}
        {!loading ? rightIcon : null}
      </button>
    );
  }
);

export default Button;
