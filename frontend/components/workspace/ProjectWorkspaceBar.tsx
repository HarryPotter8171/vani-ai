'use client';

import React from 'react';
import { MessageSquare, Files, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROJECT_WORKSPACE_ITEMS } from '@/lib/workspace/types';
import type { Project } from '@/lib/types';

type ProjectDest = (typeof PROJECT_WORKSPACE_ITEMS)[number]['id'];

const ICONS: Record<ProjectDest, LucideIcon> = {
  chat: MessageSquare,
  files: Files,
};

export interface ProjectWorkspaceBarProps {
  project: Project;
  active?: ProjectDest;
  onNavigate: (dest: ProjectDest) => void;
  className?: string;
}

/**
 * Minimal project chrome — name + essential destinations only.
 */
export default function ProjectWorkspaceBar({
  project,
  active = 'chat',
  onNavigate,
  className,
}: ProjectWorkspaceBarProps) {
  return (
    <div
      className={cn(
        'mx-3 mb-1 flex items-center justify-between gap-3 rounded-[16px] border border-border',
        'bg-surface-glass/80 px-3 py-2 backdrop-blur-[var(--blur-glass)]',
        'sm:mx-4',
        className
      )}
    >
      <p className="min-w-0 truncate text-sm font-semibold tracking-[-0.016em] text-foreground">
        {project.name}
      </p>
      <div className="flex shrink-0 gap-1">
        {PROJECT_WORKSPACE_ITEMS.map(({ id, label }) => {
          const Icon = ICONS[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
                'text-micro font-medium tracking-[-0.01em]',
                'transition-colors duration-fast',
                isActive
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-foreground'
              )}
            >
              <Icon size={12} strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
