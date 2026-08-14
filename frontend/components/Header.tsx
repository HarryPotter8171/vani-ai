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
    <div className="pointer-events-none fixed left-4 top-12 z-30 md:absolute md:left-3 md:top-3">
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
      </button><span className="pointer-events-auto ml-2 bg-red-500 text-white px-2 py-1 text-xs rounded z-50">v2.0</span>
    </div>
  );
}
