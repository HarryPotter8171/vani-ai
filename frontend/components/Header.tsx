'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  /** Toggles the sidebar: mobile drawer open/close, desktop expand/collapse. */
  onToggleSidebar?: () => void;
}

/**
 * Gemini-style hamburger — always available.
 * Mobile opens the drawer; desktop expands/collapses the icon rail.
 */
export default function Header({ onToggleSidebar }: HeaderProps) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 max-md:left-[max(0.75rem,env(safe-area-inset-left))] max-md:top-[max(0.75rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onToggleSidebar}
        className={cn(
          'pointer-events-auto inline-flex items-center justify-center rounded-full',
          /* 44×44 touch target on mobile; compact on desktop */
          'h-11 w-11 md:h-9 md:w-9',
          'bg-surface-input text-muted-foreground',
          'backdrop-blur-[22px] border border-border',
          'shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
          'transition-[background-color,color,transform] duration-fast ease-apple',
          'hover:bg-foreground/[0.05] hover:text-foreground',
          'active:scale-[0.96] pressable',
          'touch-manipulation',
          'dark:shadow-[0_1px_4px_rgba(0,0,0,0.35)]'
        )}
        aria-label="Toggle sidebar"
      >
        <Menu size={18} strokeWidth={1.75} className="md:h-4 md:w-4" />
      </button>
    </div>
  );
}
