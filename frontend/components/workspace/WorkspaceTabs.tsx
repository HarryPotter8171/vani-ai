'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  PanelsTopLeft,
  Files,
  Search,
  Brain,
  ListTodo,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { WORKSPACE_TABS, type WorkspaceTab } from '@/lib/workspace/types';

const ICONS: Record<WorkspaceTab, LucideIcon> = {
  chat: MessageSquare,
  canvas: PanelsTopLeft,
  files: Files,
  research: Search,
  memory: Brain,
  tasks: ListTodo,
  automation: Zap,
};

export interface WorkspaceTabsProps {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  /** Optional badges per tab (e.g. file count). */
  badges?: Partial<Record<WorkspaceTab, number | string>>;
  className?: string;
}

export default function WorkspaceTabs({
  active,
  onChange,
  badges,
  className,
}: WorkspaceTabsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto custom-scrollbar',
        'px-3 py-2 sm:px-4',
        className
      )}
      role="tablist"
      aria-label="Workspace"
    >
      {WORKSPACE_TABS.map(({ id, label }) => {
        const Icon = ICONS[id];
        const isActive = active === id;
        const badge = badges?.[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5',
              'text-sm font-medium tracking-[-0.014em]',
              'transition-colors duration-fast ease-apple',
              isActive
                ? 'text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-foreground'
            )}
          >
            {isActive ? (
              <motion.span
                layoutId="workspace-tab-pill"
                className="absolute inset-0 rounded-full bg-accent-muted shadow-1"
                transition={SPRING.snappy}
              />
            ) : null}
            <Icon size={14} strokeWidth={1.75} className="relative z-[1]" />
            <span className="relative z-[1]">{label}</span>
            {badge != null && badge !== 0 ? (
              <span
                className={cn(
                  'relative z-[1] min-w-[16px] rounded-full px-1 py-px',
                  'text-micro font-semibold tabular-nums',
                  isActive
                    ? 'bg-accent/20 text-accent'
                    : 'bg-surface-hover text-text-tertiary'
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
