'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  /** Opens the mobile sidebar drawer. Desktop sidebar is always visible. */
  onToggleSidebar?: () => void;
}

/**
 * Mobile-only sidebar affordance — no floating chat chrome.
 * All navigation and conversation tools live in the Sidebar.
 */
export default function Header({ onToggleSidebar }: HeaderProps) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 md:hidden">
      <button
        type="button"
        onClick={onToggleSidebar}
        className={cn(
          'pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full',
          'bg-surface-input text-muted-foreground',
          'backdrop-blur-[22px] border border-border',
          'shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
          'transition-colors duration-normal ease-out',
          'hover:bg-foreground/[0.05] hover:text-foreground',
          'dark:shadow-[0_1px_4px_rgba(0,0,0,0.35)]'
        )}
        aria-label="Toggle sidebar"
      >
        <Menu size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
