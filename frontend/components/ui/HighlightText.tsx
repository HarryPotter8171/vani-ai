import React from 'react';
import { cn } from '@/lib/utils';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HighlightTextProps {
  text: string;
  /** Substring to highlight (case-insensitive). Empty/whitespace renders plain text. */
  query: string;
  className?: string;
}

/**
 * Renders `text` with every case-insensitive occurrence of `query` wrapped
 * in a `<mark>`. Pure/presentational — no matches found (or an empty query)
 * just renders the plain text.
 */
export default function HighlightText({ text, query, className }: HighlightTextProps) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  // A single capturing group makes String.split() interleave the matched
  // delimiters back into the result at odd indices — no regex.exec/lastIndex
  // state to manage, and no risk of overlapping-match bugs.
  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className={cn(
              'rounded-[3px] bg-primary/25 text-inherit dark:bg-primary/35',
              className
            )}
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
