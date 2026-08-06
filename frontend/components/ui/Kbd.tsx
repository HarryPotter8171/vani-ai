'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

/** Compact keyboard key glyph for hints & shortcut sheets. */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center',
        'rounded-[5px] px-1.5',
        'border border-border/80 bg-surface-hover',
        'font-sans text-micro font-semibold tabular-nums tracking-[-0.02em]',
        'text-text-tertiary shadow-[0_1px_0_rgba(0,0,0,0.06)]',
        'dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]',
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function ShortcutHint({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

export default Kbd;
