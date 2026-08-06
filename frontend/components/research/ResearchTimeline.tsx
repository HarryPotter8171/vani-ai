'use client';

import React from 'react';
import { Check, Circle, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { RESEARCH_PHASES, type ResearchPhase, type ResearchTimelineEntry } from '@/lib/research';

export interface ResearchTimelineProps {
  phase: string | null;
  status: string;
  timeline: ResearchTimelineEntry[];
  className?: string;
}

function phaseStatus(
  phaseId: ResearchPhase,
  current: string | null,
  overall: string
): 'completed' | 'running' | 'pending' | 'failed' {
  if (overall === 'failed' && current === phaseId) return 'failed';
  if (overall === 'completed') return 'completed';

  const order = RESEARCH_PHASES.map((p) => p.id);
  const curIdx = current ? order.indexOf(current as ResearchPhase) : -1;
  const idx = order.indexOf(phaseId);

  if (curIdx < 0) return 'pending';
  if (idx < curIdx) return 'completed';
  if (idx === curIdx) return overall === 'cancelled' ? 'failed' : 'running';
  return 'pending';
}

function PhaseIcon({ status }: { status: 'completed' | 'running' | 'pending' | 'failed' }) {
  if (status === 'completed') {
    return <Check size={12} strokeWidth={2.25} className="text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === 'failed') {
    return <X size={12} strokeWidth={2.25} className="text-rose-500" />;
  }
  if (status === 'running') {
    return (
      <Spinner size={12}
        strokeWidth={2}
        className="text-accent"
 />
    );
  }
  return <Circle size={10} strokeWidth={1.75} className="text-muted-foreground/40" />;
}

export default function ResearchTimeline({
  phase,
  status,
  timeline,
  className }: ResearchTimelineProps) {
  const recent = timeline.slice(-6).reverse();

  return (
    <div className={cn('space-y-3', className)}>
      <ol className="space-y-1.5">
        {RESEARCH_PHASES.map((p) => {
          const st = phaseStatus(p.id, phase, status);
          return (
            <li key={p.id} className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full',
                  st === 'running' && 'bg-accent-muted',
                  st === 'completed' && 'bg-emerald-500/10',
                  st === 'failed' && 'bg-rose-500/10'
                )}
              >
                <PhaseIcon status={st} />
              </span>
              <span
                className={cn(
                  'text-sm tracking-[-0.01em]',
                  st === 'running' && 'font-medium text-foreground',
                  st === 'completed' && 'text-muted-foreground',
                  st === 'pending' && 'text-muted-foreground/55',
                  st === 'failed' && 'text-rose-500'
                )}
              >
                {p.label}
              </span>
            </li>
          );
        })}
      </ol>

      {recent.length > 0 && (
        <div className="border-t border-black/[0.04] pt-2 dark:border-white/[0.06]">
          <p className="mb-1.5 text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
            Activity
          </p>
          <ul className="space-y-1">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="truncate text-micro leading-snug tracking-[-0.01em] text-muted-foreground/80"
                title={entry.detail || entry.label}
              >
                {entry.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
