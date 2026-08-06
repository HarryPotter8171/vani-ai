'use client';

import { Check, Circle, Pause, ListOrdered, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { cn } from '@/lib/utils';
import type { BrowserTimelineEvent } from '@/lib/browser';

export interface BrowserTimelineProps {
  events: BrowserTimelineEvent[];
  className?: string;
}

function EventIcon({ kind }: { kind: BrowserTimelineEvent['kind'] }) {
  if (kind === 'completed') {
    return <Check size={12} strokeWidth={2.25} className="text-emerald-600 dark:text-emerald-400" />;
  }
  if (kind === 'failed') {
    return <X size={12} strokeWidth={2.25} className="text-rose-500" />;
  }
  if (kind === 'paused') {
    return <Pause size={11} strokeWidth={2} className="text-amber-500" />;
  }
  if (
    kind === 'opening' ||
    kind === 'loading' ||
    kind === 'clicking' ||
    kind === 'typing' ||
    kind === 'reading' ||
    kind === 'waiting' ||
    kind === 'uploading' ||
    kind === 'downloading' ||
    kind === 'scrolling' ||
    kind === 'approval'
  ) {
    return (
      <Spinner size={12}
        strokeWidth={2}
        className="text-accent"
 />
    );
  }
  return <Circle size={9} strokeWidth={1.75} className="text-muted-foreground/45" />;
}

export default function BrowserTimeline({ events, className }: BrowserTimelineProps) {
  if (!events.length) {
    return (
      <PremiumEmpty
        size="sm"
        icon={ListOrdered}
        title="No steps yet"
        description="Browser actions will appear here as they run."
        className="px-1 py-4"
      />
    );
  }

  const recent = events.slice(-40);

  return (
    <ol className={cn('space-y-1.5', className)}>
      {recent.map((event, index) => {
        const isLatest = index === recent.length - 1;
        return (
          <li
            key={event.id}
            className={cn(
              'flex items-start gap-2 rounded-xl px-2 py-1.5',
              isLatest && 'bg-foreground/[0.03] dark:bg-white/[0.03]'
            )}
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {isLatest &&
              !['completed', 'failed', 'info', 'warning', 'screenshot', 'resumed'].includes(
                event.kind
              ) ? (
                <EventIcon kind={event.kind} />
              ) : event.kind === 'completed' || event.kind === 'failed' ? (
                <EventIcon kind={event.kind} />
              ) : (
                <Circle size={8} className="text-muted-foreground/35" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-sm tracking-[-0.01em]',
                  isLatest ? 'font-medium text-foreground/90' : 'text-foreground/70'
                )}
              >
                {event.message}
              </p>
              <p className="text-micro tabular-nums text-muted-foreground/55">
                {new Date(event.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit' })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
