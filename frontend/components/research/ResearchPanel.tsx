'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Download,
  FileText,
  RotateCcw,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import type { ResearchState } from '@/lib/research';
import ResearchTimeline from './ResearchTimeline';
import SourceList from './SourceList';
import CitationViewer from './CitationViewer';

export interface ResearchPanelProps {
  state: ResearchState;
  isRunning: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onStop?: () => void;
  onResume?: () => void;
  canResume?: boolean;
  onFollowUp?: (question: string) => void;
  className?: string;
}

function formatEta(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s left`;
  const m = Math.ceil(seconds / 60);
  return `~${m} min left`;
}

export default function ResearchPanel({
  state,
  isRunning,
  open: openProp,
  onOpenChange,
  onStop,
  onResume,
  canResume,
  onFollowUp,
  className,
}: ResearchPanelProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const [tab, setTab] = useState<'timeline' | 'sources'>('timeline');
  const [exporting, setExporting] = useState(false);

  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };

  const show =
    isRunning ||
    Boolean(canResume) ||
    state.progress > 0 ||
    state.timeline.length > 0 ||
    state.status === 'completed' ||
    state.status === 'cancelled' ||
    state.status === 'failed' ||
    state.status === 'paused';

  if (!show) return null;

  const phaseLabel =
    state.phase === 'writing'
      ? 'Writing report'
      : state.phase
        ? state.phase.charAt(0).toUpperCase() + state.phase.slice(1)
        : 'Deep Research';

  const handlePdf = async () => {
    setExporting(true);
    try {
      const { downloadResearchPdf } = await import('@/lib/research/export');
      await downloadResearchPdf(state);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[22px]',
        'border border-black/[0.05] dark:border-white/[0.07]',
        'bg-white/55 dark:bg-white/[0.035]',
        'backdrop-blur-xl',
        'shadow-[0_4px_20px_rgba(0,0,0,0.04),inset_0_0.5px_0_rgba(255,255,255,0.55)]',
        'dark:shadow-[0_8px_28px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.04)]',
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-muted-foreground/70 transition-transform duration-200',
              !open && '-rotate-90'
            )}
 />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">
              Deep Research
              {state.phase ? ` · ${phaseLabel}` : ''}
            </p>
            <p className="text-micro tabular-nums text-muted-foreground/70">
              {state.progress}% complete
              {state.etaSeconds != null && isRunning
                ? ` · ${formatEta(state.etaSeconds)}`
                : ''}
              {state.confidence != null && state.status === 'completed'
                ? ` · ${Math.round(state.confidence * 100)}% confidence`
                : ''}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {canResume && onResume && !isRunning && (
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={onResume}
              className="h-auto w-auto p-1.5"
              aria-label="Resume research"
              title="Resume"
            >
              <RotateCcw size={14} />
            </Button>
          )}
          {isRunning && onStop && (
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={onStop}
              className="h-auto w-auto p-1.5 text-rose-500/90 hover:bg-rose-500/10 hover:text-rose-500/90"
              aria-label="Stop research"
              title="Stop"
            >
              <Square size={12} fill="currentColor" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-surface-hover">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover"
          initial={false}
          animate={{ width: `${Math.max(2, state.progress)}%` }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
 />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="flex gap-1 px-3 pb-2">
              <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>
                Timeline
              </TabButton>
              <TabButton active={tab === 'sources'} onClick={() => setTab('sources')}>
                Sources{state.sources.length ? ` · ${state.sources.length}` : ''}
              </TabButton>
            </div>

            <div className="px-3 pb-3">
              {tab === 'timeline' ? (
                <ResearchTimeline
                  phase={state.phase}
                  status={state.status}
                  timeline={state.timeline}
 />
              ) : (
                <SourceList sources={state.sources} />
              )}
            </div>

            {state.contradictions.length > 0 && (
              <div className="mx-3 mb-3 rounded-[14px] bg-amber-500/[0.07] px-3 py-2 dark:bg-amber-400/[0.08]">
                <p className="text-micro font-semibold uppercase tracking-[0.05em] text-amber-700/80 dark:text-amber-300/80">
                  Contradictions
                </p>
                <ul className="mt-1 space-y-1">
                  {state.contradictions.slice(0, 3).map((c, i) => (
                    <li
                      key={i}
                      className="text-micro leading-snug text-amber-900/80 dark:text-amber-100/75"
                    >
                      {c.claim}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(state.status === 'completed' || state.citations.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-black/[0.04] px-3 py-2.5 dark:border-white/[0.06]">
                <CitationViewer citations={state.citations} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const { downloadResearchMarkdown } = await import('@/lib/research/export');
                    downloadResearchMarkdown(state);
                  }}
                  leftIcon={<FileText size={13} />}
                  className="px-2.5 text-muted-foreground hover:text-foreground"
                >
                  Markdown
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={exporting}
                  onClick={() => void handlePdf()}
                  leftIcon={<Download size={13} />}
                  className="px-2.5 text-muted-foreground hover:text-foreground"
                >
                  PDF
                </Button>
              </div>
            )}

            {state.followUpQuestions.length > 0 && state.status === 'completed' && (
              <div className="border-t border-black/[0.04] px-3 py-2.5 dark:border-white/[0.06]">
                <p className="mb-1.5 text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
                  Follow-up
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {state.followUpQuestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onFollowUp?.(q)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-left text-micro tracking-[-0.01em]',
                        'bg-black/[0.035] text-muted-foreground',
                        'hover:bg-accent-muted hover:text-accent',
                        'dark:bg-white/[0.05] dark:hover:bg-accent-muted dark:hover:text-accent',
                        'transition-colors'
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.error && state.status !== 'completed' && (
              <ErrorState
                compact
                title="Research error"
                message={state.error}
                onRetry={canResume && onResume && !isRunning ? onResume : undefined}
                retryLabel="Resume"
                className="px-3 pb-3"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 text-micro font-medium tracking-[-0.01em] transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground/70 hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
