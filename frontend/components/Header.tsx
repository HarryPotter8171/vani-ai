'use client';

import React from 'react';
import { Sun, Moon, Menu, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeContext } from '@/components/layout/ThemeProvider';

export interface HeaderProps {
  onToggleSidebar?: () => void;
  projectName?: string | null;
}

export default function Header({ onToggleSidebar, projectName }: HeaderProps) {
  const { theme, toggleTheme, mounted } = useThemeContext();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-4 pt-4 sm:px-6 md:px-8 md:pt-5">
      <div
        className={cn(
          'pointer-events-auto relative flex h-10 w-full max-w-[720px] items-center justify-between',
          'rounded-full px-1.5 sm:px-2',
          'bg-white/45 dark:bg-white/[0.04]',
          'backdrop-blur-2xl backdrop-saturate-[1.7]',
          'border border-black/[0.04] dark:border-white/[0.05]',
          'shadow-[0_1px_1px_rgba(0,0,0,0.015),0_4px_16px_rgba(0,0,0,0.03),inset_0_0.5px_0_rgba(255,255,255,0.6)]',
          'dark:shadow-[0_1px_1px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.045)]'
        )}
      >
        {/* Left — mobile menu */}
        <div className="flex w-11 items-center justify-start">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cn(
              'hover-lift inline-flex h-7 w-7 items-center justify-center rounded-full md:hidden',
              'text-muted-foreground/80',
              'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              'hover:bg-foreground/[0.045] hover:text-foreground',
              'dark:hover:bg-white/[0.06]'
            )}
            aria-label="Toggle sidebar"
          >
            <Menu size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Center — model selector */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <button
            type="button"
            className={cn(
              'hover-lift group flex items-center gap-2 rounded-full',
              'bg-black/[0.03] dark:bg-white/[0.045]',
              'border border-black/[0.035] dark:border-white/[0.06]',
              'px-3 py-1',
              'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              'hover:bg-black/[0.045] dark:hover:bg-white/[0.07]'
            )}
          >
            <span className="relative flex h-[7px] w-[7px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/35 opacity-50" />
              <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-primary shadow-[0_0_8px_var(--primary-glow)]" />
            </span>
            <span className="text-[13px] font-medium tracking-[-0.014em] text-foreground">
              {projectName ? projectName : 'VANI Pro'}
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              className="text-muted-foreground/60 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-y-px"
            />
          </button>
        </div>

        {/* Right — theme + avatar */}
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className={cn(
              'hover-lift inline-flex h-7 w-7 items-center justify-center rounded-full',
              'text-muted-foreground/80',
              'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              'hover:bg-foreground/[0.045] hover:text-foreground',
              'dark:hover:bg-white/[0.06]'
            )}
            aria-label="Toggle theme"
          >
            {mounted && theme === 'dark' ? (
              <Sun size={15} strokeWidth={1.75} />
            ) : (
              <Moon size={15} strokeWidth={1.75} />
            )}
          </button>

          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full',
              'bg-gradient-to-br from-[#0A84FF] to-[#5856D6]',
              'text-[9px] font-semibold tracking-tight text-white',
              'shadow-[0_1px_2px_rgba(0,122,255,0.16),0_2px_8px_rgba(0,122,255,0.18)]',
              'ring-1 ring-white/20'
            )}
            aria-hidden="true"
          >
            HG
          </div>
        </div>
      </div>
    </header>
  );
}
