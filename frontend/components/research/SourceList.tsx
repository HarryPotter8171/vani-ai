'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchSource } from '@/lib/research';

export interface SourceListProps {
  sources: ResearchSource[];
  className?: string;
}

export default function SourceList({ sources, className }: SourceListProps) {
  if (!sources.length) {
    return (
      <p className={cn('text-caption text-muted-foreground/65', className)}>
        Sources will appear as pages are found and read.
      </p>
    );
  }

  return (
    <ul className={cn('space-y-1.5', className)}>
      {sources.map((source, i) => (
        <li key={source.url || i}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'group flex items-start gap-2 rounded-[12px] px-2 py-1.5',
              'transition-colors duration-150',
              'hover:bg-surface-hover'
            )}
          >
            <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-accent-muted text-micro font-semibold tabular-nums text-accent">
              {source.citationId || i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">
                  {source.title}
                </span>
                <ExternalLink
                  size={11}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
 />
              </span>
              {source.snippet ? (
                <span className="mt-0.5 line-clamp-2 text-micro leading-snug text-muted-foreground/75">
                  {source.snippet}
                </span>
              ) : null}
              {typeof source.score === 'number' ? (
                <span className="mt-0.5 block text-micro tabular-nums text-muted-foreground/55">
                  Relevance {Math.round(source.score * 100)}%
                  {source.provider ? ` · ${source.provider}` : ''}
                </span>
              ) : null}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
