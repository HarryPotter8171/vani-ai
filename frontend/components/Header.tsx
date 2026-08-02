'use client';

import React from 'react';
import { Sun, Moon, Menu, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeContext } from '@/components/layout/ThemeProvider';

export interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { theme, toggleTheme, mounted } = useThemeContext();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-5 pt-4 md:px-8 md:pt-5">
      <div
        className={cn(
          'pointer-events-auto flex h-[54px] w-full max-w-[680px] items-center justify-between',
          'glass-panel px-4 md:px-5'
        )}
      >
        <div className="flex w-10 items-center">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cn(
              'hover-lift inline-flex h-9 w-9 items-center justify-center rounded-full',
              'text-muted-foreground hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06] md:hidden'
            )}
            aria-label="Toggle sidebar"
          >
            <Menu size={19} strokeWidth={1.75} />
          </button>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2">
          <button
            type="button"
            className={cn(
              'hover-lift group flex items-center gap-2.5 rounded-full',
              'bg-foreground/[0.03] dark:bg-white/[0.05]',
              'border border-border/80 px-4 py-2',
              'transition-all duration-300 ease-apple',
              'hover:bg-foreground/[0.06] dark:hover:bg-white/[0.08]'
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary-glow)]" />
            </span>
            <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground">
              VANI Pro
            </span>
            <ChevronDown
              size={13}
              strokeWidth={2.5}
              className="text-muted-foreground/70 transition-transform duration-300 group-hover:translate-y-px"
            />
          </button>
        </div>

        <div className="flex w-[76px] items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className={cn(
              'hover-lift inline-flex h-9 w-9 items-center justify-center rounded-full',
              'text-muted-foreground hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06]'
            )}
            aria-label="Toggle theme"
          >
            {mounted && theme === 'dark' ? (
              <Sun size={17} strokeWidth={1.75} />
            ) : (
              <Moon size={17} strokeWidth={1.75} />
            )}
          </button>

          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              'bg-gradient-to-br from-[#007AFF] to-[#5856D6]',
              'text-[10.5px] font-semibold text-white',
              'shadow-[0_2px_12px_rgba(0,122,255,0.25)] ring-1 ring-white/15'
            )}
          >
            HG
          </div>
        </div>
      </div>
    </header>
  );
}
