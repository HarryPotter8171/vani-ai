'use client';

import React from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageErrorCardProps {
  disabled?: boolean;
  onRetry?: () => void;
  onEditPrompt?: () => void;
  /** Optional partial reply that streamed before failure — shown muted. */
  partialContent?: string;
}

/**
 * Friendly failure surface — never raw backend / network strings.
 */
export default function MessageErrorCard({
  disabled,
  onRetry,
  onEditPrompt,
  partialContent,
}: MessageErrorCardProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3" role="alert">
      <div className="min-w-0">
        <p className="text-chat font-medium tracking-[-0.015em] text-foreground">
          We couldn&apos;t generate a response.
        </p>
        <p className="mt-1 text-sm tracking-[-0.012em] text-text-tertiary">
          Something went wrong on this turn. You can retry or edit your prompt.
        </p>
        {partialContent?.trim() ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-tertiary/80">
            {partialContent.trim()}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onRetry ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onRetry}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2',
              'text-sm font-medium tracking-[-0.02em]',
              'bg-accent text-text-on-accent',
              'shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
              'transition-transform duration-150 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              'disabled:pointer-events-none disabled:opacity-40'
            )}
          >
            <RotateCcw size={14} strokeWidth={2} />
            Retry
          </button>
        ) : null}
        {onEditPrompt ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onEditPrompt}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2',
              'text-sm font-medium tracking-[-0.02em]',
              'bg-surface-secondary text-foreground',
              'ring-1 ring-border-subtle/70',
              'transition-colors duration-150 hover:bg-surface-hover',
              'active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
              'disabled:pointer-events-none disabled:opacity-40'
            )}
          >
            <Pencil size={14} strokeWidth={1.75} />
            Edit Prompt
          </button>
        ) : null}
      </div>
    </div>
  );
}
