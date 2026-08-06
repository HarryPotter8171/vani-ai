'use client';

import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  FolderKanban,
  Files,
  Brain,
  Bot,
  Search,
  Mic,
  MessageSquare,
  X,
  RefreshCw,
  LayoutDashboard,
  ImageIcon,
  Globe2,
  TerminalSquare,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { Spinner } from '@/components/ui/Spinner';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import CircularProgress, { MiniChart } from '@/components/ui/CircularProgress';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useMemory } from '@/hooks/useMemory';
import { useToast } from '@/components/ui/Toast';
import type { ChatSummary, Project } from '@/lib/types';

export interface AiDashboardProps {
  open: boolean;
  onClose: () => void;
  projects?: Project[];
  recentChats?: ChatSummary[];
  onOpenAnalytics?: () => void;
  onOpenMemory?: () => void;
  onOpenAgents?: () => void;
  onOpenVoice?: () => void;
  onSelectProject?: (projectId: string) => void;
  onSelectChat?: (chatId: string) => void;
  onStartResearch?: () => void;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MetricTile({
  icon: Icon,
  label,
  value,
  numericValue,
  hint,
  onClick,
  progress,
  chart,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  /** When set, animates count-up instead of static value */
  numericValue?: number;
  hint?: string;
  onClick?: () => void;
  progress?: { value: number; max: number };
  chart?: number[];
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-[18px] border border-border px-3.5 py-3.5 text-left',
        'bg-surface-glass backdrop-blur-[var(--blur-glass)]',
        'shadow-[var(--shadow-1)]',
        onClick &&
          'transition-all duration-normal ease-out hover:border-accent/22 hover:bg-surface-glass-strong hover:shadow-2 hover:-translate-y-0.5'
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-normal group-hover:opacity-100">
        <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-accent/10 blur-2xl" />
      </div>
      <div className="relative mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-accent-muted text-accent transition-transform duration-normal group-hover:scale-105">
            <Icon size={15} strokeWidth={1.75} />
          </span>
          <span className="text-caption font-medium tracking-[-0.01em] text-text-secondary">
            {label}
          </span>
        </div>
        {progress ? (
          <CircularProgress
            value={progress.value}
            max={progress.max}
            size={36}
            strokeWidth={3.5}
            label={`${Math.round((progress.value / Math.max(progress.max, 1)) * 100)}%`}
          />
        ) : null}
      </div>
      <div className="relative text-lg font-semibold tracking-[-0.03em] tabular-nums text-foreground">
        {typeof numericValue === 'number' ? (
          <AnimatedCounter
            value={numericValue}
            format={(n) => {
              if (value.endsWith('m')) return `${formatNum(Math.round(n))}m`;
              if (value.includes('K') || value.includes('M')) return formatNum(Math.round(n));
              return formatNum(Math.round(n));
            }}
          />
        ) : (
          value
        )}
      </div>
      {chart ? <MiniChart values={chart} className="relative mt-2.5" /> : null}
      {hint ? (
        <div className="relative mt-1 text-micro text-text-tertiary">{hint}</div>
      ) : null}
    </Comp>
  );
}

export default function AiDashboard({
  open,
  onClose,
  projects = [],
  recentChats = [],
  onOpenAnalytics,
  onOpenMemory,
  onOpenAgents,
  onOpenVoice,
  onSelectProject,
  onSelectChat,
  onStartResearch,
}: AiDashboardProps) {
  const { showToast } = useToast();
  const {
    analytics,
    loading,
    error,
    refresh,
  } = useAnalytics({
    enabled: open,
    onError: (message) => showToast(message, 'error'),
  });
  const memory = useMemory({ enabled: open });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const totals = analytics?.totals;
  const fileCount = useMemo(
    () =>
      projects.reduce((sum, p) => sum + (p.stats?.fileCount || 0), 0),
    [projects]
  );
  const projectCount = projects.filter((p) => !p.archived).length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close AI dashboard"
            className="absolute inset-0 modal-overlay"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-dashboard-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE.smooth }}
            className={cn(
              'relative flex h-[min(90vh,860px)] w-full max-w-[880px] flex-col overflow-hidden',
              'rounded-t-[28px] sm:rounded-[28px]',
              'bg-surface border border-border',
              'backdrop-blur-2xl backdrop-saturate-[1.6]',
              'shadow-[0_24px_80px_rgba(0,0,0,0.28)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.65)]'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-16 -top-20 h-52 w-52 rounded-full bg-accent/12 blur-3xl" />
              <div className="absolute -right-12 top-28 h-44 w-44 rounded-full bg-[#5e5ce6]/10 blur-3xl" />
            </div>

            {/* Header */}
            <div className="relative flex items-start justify-between gap-4 border-b border-border px-5 pb-4 pt-5 sm:px-6">
              <div className="flex items-start gap-3">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING.soft}
                  className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent text-text-on-accent shadow-[0_4px_16px_var(--accent-glow)]"
                >
                  <LayoutDashboard size={18} strokeWidth={1.75} />
                </motion.div>
                <div>
                  <h2
                    id="ai-dashboard-title"
                    className="text-title font-semibold tracking-[-0.025em] text-foreground"
                  >
                    AI Dashboard
                  </h2>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    Usage, projects, memory, agents & more — at a glance
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => refresh()}
                  aria-label="Refresh"
                  className="rounded-full p-2 text-text-tertiary hover:bg-surface-hover hover:text-foreground"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-full p-2 text-text-tertiary hover:bg-surface-hover hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {loading && !analytics ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-text-tertiary">
                  <Spinner />
                  <span className="text-sm">Loading your AI overview…</span>
                </div>
              ) : error && !analytics ? (
                <ErrorState
                  compact
                  title="Couldn't load overview"
                  message={error}
                  onRetry={() => refresh()}
                  retrying={loading}
                />
              ) : (
                <div className="space-y-7">
                  {/* Usage */}
                  <section>
                    <h3 className="os-section-label mb-3 px-0.5">Usage</h3>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <MetricTile
                        icon={MessageSquare}
                        label="Chats"
                        value={formatNum(totals?.chats ?? recentChats.length)}
                        numericValue={totals?.chats ?? recentChats.length}
                        hint="All time"
                        chart={[2, 4, 3, 6, 5, 8, 7]}
                      />
                      <MetricTile
                        icon={BarChart3}
                        label="Tokens"
                        value={formatNum(totals?.tokens ?? 0)}
                        numericValue={totals?.tokens ?? 0}
                        hint={analytics?.plan?.name || 'Plan usage'}
                        chart={[3, 5, 4, 7, 6, 9, 8]}
                      />
                      <MetricTile
                        icon={ImageIcon}
                        label="Images"
                        value={formatNum(totals?.imagesGenerated ?? 0)}
                        numericValue={totals?.imagesGenerated ?? 0}
                        chart={[1, 2, 1, 3, 4, 2, 5]}
                      />
                      <MetricTile
                        icon={Mic}
                        label="Voice"
                        value={`${formatNum(totals?.voiceMinutes ?? 0)}m`}
                        numericValue={totals?.voiceMinutes ?? 0}
                        hint="Minutes"
                        onClick={onOpenVoice}
                      />
                    </div>
                  </section>

                  {/* Domain cards */}
                  <section>
                    <h3 className="os-section-label mb-3 px-0.5">Workspace</h3>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <MetricTile
                        icon={FolderKanban}
                        label="Projects"
                        value={String(projectCount)}
                        numericValue={projectCount}
                        hint={`${fileCount} files indexed`}
                        progress={
                          projectCount > 0
                            ? { value: Math.min(projectCount, 10), max: 10 }
                            : undefined
                        }
                      />
                      <MetricTile
                        icon={Files}
                        label="Files"
                        value={String(fileCount)}
                        numericValue={fileCount}
                        hint={formatBytes(totals?.fileStorageBytes ?? 0)}
                      />
                      <MetricTile
                        icon={Brain}
                        label="Memory"
                        value={String(memory.total || memory.memories.length)}
                        numericValue={memory.total || memory.memories.length}
                        hint={memory.settings?.enabled === false ? 'Paused' : 'Active'}
                        onClick={onOpenMemory}
                      />
                      <MetricTile
                        icon={Bot}
                        label="Agents"
                        value="Ready"
                        hint="Open agents"
                        onClick={onOpenAgents}
                      />
                      <MetricTile
                        icon={Search}
                        label="Research"
                        value={formatNum(totals?.deepResearchSessions ?? 0)}
                        hint="Deep research runs"
                        onClick={onStartResearch}
                      />
                      <MetricTile
                        icon={Globe2}
                        label="Browser"
                        value={formatNum(totals?.browserSessions ?? 0)}
                        hint="Automation sessions"
                      />
                      <MetricTile
                        icon={TerminalSquare}
                        label="Code"
                        value={formatNum(totals?.codeInterpreterRuns ?? 0)}
                        hint="Interpreter runs"
                      />
                      <MetricTile
                        icon={BarChart3}
                        label="Analytics"
                        value="Open"
                        hint="Detailed charts"
                        onClick={() => {
                          onClose();
                          onOpenAnalytics?.();
                        }}
                      />
                    </div>
                  </section>

                  {/* Recent activity */}
                  <section className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <h3 className="os-section-label mb-2.5 px-0.5">Recent chats</h3>
                      <ul className="space-y-1">
                        {recentChats.slice(0, 5).map((chat) => (
                          <li key={chat.id}>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectChat?.(chat.id);
                                onClose();
                              }}
                              className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left hover:bg-surface-hover"
                            >
                              <MessageSquare
                                size={13}
                                className="shrink-0 text-text-tertiary"
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                {chat.title || 'Untitled'}
                              </span>
                              <span className="text-micro text-text-tertiary">
                                {formatRelativeTime(chat.updatedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                        {!recentChats.length ? (
                          <PremiumEmpty
                            size="sm"
                            icon={MessageSquare}
                            title="No chats yet"
                            description="Start a conversation to see it here."
                            className="px-2 py-4"
                          />
                        ) : null}
                      </ul>
                    </div>
                    <div>
                      <h3 className="os-section-label mb-2.5 px-0.5">Projects</h3>
                      <ul className="space-y-1">
                        {projects.filter((p) => !p.archived).slice(0, 5).map((project) => (
                          <li key={project._id}>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectProject?.(project._id);
                                onClose();
                              }}
                              className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left hover:bg-surface-hover"
                            >
                              <FolderKanban
                                size={13}
                                className="shrink-0 text-text-tertiary"
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                {project.name}
                              </span>
                              <span className="text-micro text-text-tertiary">
                                {project.stats?.fileCount
                                  ? `${project.stats.fileCount} files`
                                  : formatRelativeTime(
                                      project.lastOpenedAt || project.updatedAt
                                    )}
                              </span>
                            </button>
                          </li>
                        ))}
                        {!projects.length ? (
                          <PremiumEmpty
                            size="sm"
                            icon={FolderKanban}
                            title="No projects yet"
                            description="Create a project to organize chats and files."
                            className="px-2 py-4"
                          />
                        ) : null}
                      </ul>
                    </div>
                  </section>

                  {/* Memory preview */}
                  {memory.memories.length > 0 ? (
                    <section>
                      <div className="mb-2.5 flex items-center justify-between px-0.5">
                        <h3 className="os-section-label px-0">Memory highlights</h3>
                        <button
                          type="button"
                          onClick={onOpenMemory}
                          className="text-micro font-medium text-accent hover:underline"
                        >
                          Manage
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {memory.memories.slice(0, 3).map((m) => (
                          <div
                            key={m.id}
                            className="rounded-[14px] border border-border-subtle bg-surface-hover px-3.5 py-2.5"
                          >
                            <p className="text-sm leading-relaxed text-foreground/90">
                              {m.content.slice(0, 140)}
                              {m.content.length > 140 ? '…' : ''}
                            </p>
                            <div className="mt-1 text-micro capitalize text-text-tertiary">
                              {m.category} · {m.source}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
