'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  Globe2,
  History,
  Pause,
  Play,
  Square,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BrowserRun, BrowserScreenshotSummary } from '@/lib/browser';
import { browserScreenshotUrl } from '@/lib/browser';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import BrowserTimeline from './BrowserTimeline';

export interface BrowserPanelProps {
  run: BrowserRun | null;
  previewUrl: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onStop?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  className?: string;
}

function statusLabel(status: BrowserRun['status'] | undefined): string {
  switch (status) {
    case 'awaiting_approval':
      return 'Waiting for approval';
    case 'planning':
      return 'Launching browser';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Stopped';
    case 'idle':
      return 'Preparing';
    default:
      return 'Browser';
  }
}

export default function BrowserPanel({
  run,
  previewUrl,
  open = true,
  onOpenChange,
  onStop,
  onPause,
  onResume,
  className,
}: BrowserPanelProps) {
  const [tab, setTab] = useState<'live' | 'log' | 'shots'>('live');
  const [selectedShot, setSelectedShot] = useState<string | null>(null);

  if (!open || !run) return null;

  const shotId = selectedShot || run.latestScreenshotId;
  const liveSrc =
    shotId && run.runId
      ? `${browserScreenshotUrl(run.runId, shotId)}&t=${encodeURIComponent(run.updatedAt)}`
      : previewUrl;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={cn(
          'flex h-full min-h-0 w-full flex-col md:w-[420px] lg:w-[460px]',
          'border-l border-border',
          'bg-surface-glass',
          'backdrop-blur-2xl backdrop-saturate-[1.6]',
          'shadow-[-12px_0_40px_rgba(0,0,0,0.04)] dark:shadow-[-16px_0_48px_rgba(0,0,0,0.35)]',
          className
        )}
      >
        <header className="flex items-center gap-2 border-b border-black/[0.04] px-3 py-2.5 dark:border-white/[0.05]">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-muted text-accent">
            <Globe2 size={15} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-[-0.02em]">
              Browser
            </p>
            <p className="truncate text-micro text-muted-foreground/75">
              {statusLabel(run.status)}
              {run.engine ? ` · ${run.engine}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {run.canPause && onPause && (
              <IconBtn label="Pause" onClick={onPause}>
                <Pause size={14} strokeWidth={1.75} />
              </IconBtn>
            )}
            {run.canResume && onResume && (
              <IconBtn label="Resume" onClick={onResume}>
                <Play size={14} strokeWidth={1.75} />
              </IconBtn>
            )}
            {run.canStop && onStop && (
              <IconBtn label="Stop" onClick={onStop} danger>
                <Square size={13} strokeWidth={1.75} />
              </IconBtn>
            )}
            {onOpenChange && (
              <IconBtn label="Close browser panel" onClick={() => onOpenChange(false)}>
                <X size={15} strokeWidth={1.75} />
              </IconBtn>
            )}
          </div>
        </header>

        <div className="border-b border-black/[0.04] px-3 py-2 dark:border-white/[0.05]">
          <div
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5',
              'bg-foreground/[0.035] dark:bg-white/[0.04]'
            )}
          >
            <Globe2 size={12} className="shrink-0 text-muted-foreground/60" />
            <p className="truncate text-micro tabular-nums text-foreground/75">
              {run.currentUrl || 'about:blank'}
            </p>
          </div>
          {run.goal ? (
            <p className="mt-2 line-clamp-2 px-1 text-micro text-muted-foreground/80">
              {run.goal}
            </p>
          ) : null}
        </div>

        <div className="flex gap-1 px-3 pt-2">
          {(
            [
              ['live', 'Live'],
              ['log', 'Steps'],
              ['shots', 'Shots'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-micro font-medium tracking-[-0.01em]',
                tab === id
                  ? 'bg-foreground/[0.07] text-foreground dark:bg-white/[0.08]'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {tab === 'live' && (
            <div
              className={cn(
                'overflow-hidden rounded-[18px]',
                'border border-black/[0.06] dark:border-white/[0.07]',
                'bg-black/[0.03] dark:bg-black/40'
              )}
            >
              {liveSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={liveSrc}
                  alt="Live browser preview"
                  className="aspect-[16/10] w-full object-cover object-top"
 />
              ) : (
                <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 text-muted-foreground/60">
                  <Camera size={18} strokeWidth={1.5} />
                  <p className="text-caption">Preview appears as steps run</p>
                </div>
              )}
            </div>
          )}

          {tab === 'log' && <BrowserTimeline events={run.timeline || []} />}

          {tab === 'shots' && (
            <ScreenshotHistory
              runId={run.runId}
              shots={run.screenshots || []}
              selectedId={shotId}
              onSelect={setSelectedShot}
 />
          )}

          {run.error ? (
            <ErrorState
              compact
              title="Browser run failed"
              message={run.error}
              className="mt-3"
            />
          ) : null}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full',
        'transition-colors duration-200',
        danger
          ? 'text-rose-600/90 hover:bg-rose-500/[0.08] dark:text-rose-400'
          : 'text-muted-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]'
      )}
    >
      {children}
    </button>
  );
}

function ScreenshotHistory({
  runId,
  shots,
  selectedId,
  onSelect,
}: {
  runId: string;
  shots: BrowserScreenshotSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!shots.length) {
    return (
      <PremiumEmpty
        size="sm"
        icon={History}
        title="No screenshots yet"
        description="Screenshots appear as the browser run progresses."
        className="py-10"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {[...shots].reverse().map((shot) => {
        const src = browserScreenshotUrl(runId, shot.id);
        const active = shot.id === selectedId;
        return (
          <button
            key={shot.id}
            type="button"
            onClick={() => onSelect(shot.id)}
            className={cn(
              'overflow-hidden rounded-2xl border text-left',
              active
                ? 'border-accent/45'
                : 'border-black/[0.05] dark:border-white/[0.07]'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Browser screenshot" className="aspect-video w-full object-cover" />
            <p className="truncate px-2 py-1.5 text-micro text-muted-foreground/70">
              {new Date(shot.at).toLocaleTimeString()}
            </p>
          </button>
        );
      })}
    </div>
  );
}
