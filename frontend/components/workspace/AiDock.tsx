'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Files,
  Search,
  PanelsTopLeft,
  Brain,
  Bot,
  ImageIcon,
  Mic,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { DOCK_ITEMS, type DockAction } from '@/lib/workspace/types';

const ICONS: Record<DockAction, LucideIcon> = {
  files: Files,
  research: Search,
  canvas: PanelsTopLeft,
  memory: Brain,
  agents: Bot,
  images: ImageIcon,
  voice: Mic,
};

export interface AiDockProps {
  onAction: (action: DockAction) => void;
  active?: Partial<Record<DockAction, boolean>>;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
}

/**
 * Floating productivity dock above the composer.
 */
export default function AiDock({
  onAction,
  active = {},
  expanded = true,
  onExpandedChange,
  className,
}: AiDockProps) {
  return (
    <div className={cn('mb-2 flex justify-center', className)}>
      <div
        className={cn(
          'flex items-center gap-1 rounded-full border border-border',
          'bg-surface-glass backdrop-blur-[var(--blur-glass)]',
          'px-1.5 py-1 shadow-1'
        )}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse AI dock' : 'Expand AI dock'}
          aria-expanded={expanded}
          onClick={() => onExpandedChange?.(!expanded)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            'text-text-tertiary hover:bg-surface-hover hover:text-foreground',
            'transition-colors duration-fast'
          )}
        >
          <motion.span animate={{ rotate: expanded ? 0 : 180 }} transition={SPRING.snappy}>
            <ChevronDown size={14} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="dock-items"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-0.5 overflow-hidden"
            >
              {DOCK_ITEMS.map(({ id, label }) => {
                const Icon = ICONS[id];
                const isOn = !!active[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onAction(id)}
                    title={label}
                    className={cn(
                      'btn-ripple flex items-center gap-1.5 rounded-full px-2.5 py-1.5',
                      'text-micro font-medium tracking-[-0.012em]',
                      'transition-all duration-fast ease-apple',
                      isOn
                        ? 'bg-accent-muted text-accent'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Icon size={13} strokeWidth={1.75} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
