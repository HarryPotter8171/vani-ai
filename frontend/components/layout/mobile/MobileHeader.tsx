'use client';

import React from 'react';
import { Menu, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileHeaderProps {
  onToggleSidebar: () => void;
  title?: string;
  showMenu?: boolean;
}

/**
 * MobileHeader - Clean, compact mobile header
 * 
 * Features:
 * - Safe area support for iPhone notch
 * - Touch-friendly hamburger button (44x44)
 * - Minimal, distraction-free design
 * - Centered title
 * - Optional menu button
 */
function MobileHeader({ onToggleSidebar, title = 'VANI', showMenu = true }: MobileHeaderProps) {
  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'flex items-center justify-between',
        'bg-background/80 backdrop-blur-xl',
        'border-b border-border/50',
        'safe-area-top'
      )}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(48px + env(safe-area-inset-top, 0px))',
      }}
    >
      {/* Left: Hamburger Menu */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className={cn(
          'flex items-center justify-center',
          'h-11 w-11 ml-2',
          'rounded-full',
          'bg-surface-input text-foreground',
          'border border-border/70',
          'shadow-sm',
          'transition-all duration-200 ease-out',
          'hover:bg-surface-hover',
          'active:scale-95',
          'touch-manipulation'
        )}
        aria-label="Open menu"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>

      {/* Center: Title */}
      <h1 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h1>

      {/* Right: Optional Menu Button */}
      {showMenu && (
        <button
          type="button"
          className={cn(
            'flex items-center justify-center',
            'h-11 w-11 mr-2',
            'rounded-full',
            'text-muted-foreground',
            'transition-all duration-200 ease-out',
            'hover:bg-surface-hover hover:text-foreground',
            'active:scale-95',
            'touch-manipulation'
          )}
          aria-label="More options"
        >
          <MoreVertical size={20} strokeWidth={1.75} />
        </button>
      )}
    </header>
  );
}

export default MobileHeader;