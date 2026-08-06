'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Download, FileText, RefreshCw, Shield, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useToast } from '@/components/ui/Toast';
import { METRIC_LABELS, type UsageMetric } from '@/lib/billing';
import UsageChart from '@/components/analytics/UsageChart';

export interface AnalyticsPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenAdmin?: () => void;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type ChartTab = 'daily' | 'weekly' | 'monthly';

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

function StatCard({
  label,
  value }: {
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] border border-black/[0.05] px-3.5 py-3',
        'bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.03]'
      )}
    >
      <div className="text-micro font-medium tracking-[-0.01em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-title font-semibold tracking-[-0.03em] tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

export default function AnalyticsPanel({
  open,
  onClose,
  onOpenAdmin }: AnalyticsPanelProps) {
  const { showToast } = useToast();
  const [chartTab, setChartTab] = useState<ChartTab>('daily');
  const {
    analytics,
    loading,
    error,
    refresh,
    exportCsv,
    exportPdf,
    isPlatformAdmin } = useAnalytics({
    enabled: open,
    onError: (message) => showToast(message, 'error') });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const chartPoints = useMemo(() => {
    if (!analytics) return [];
    return analytics.charts[chartTab] || [];
  }, [analytics, chartTab]);

  const totals = analytics?.totals;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close analytics"
            className="absolute inset-0 modal-overlay"
            onClick={onClose}
 />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="analytics-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn(
              'relative flex max-h-[min(900px,92vh)] w-full max-w-[820px] flex-col overflow-hidden',
              'rounded-[22px] border border-border',
              'bg-surface',
              'shadow-[0_24px_80px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)]',
              'backdrop-blur-2xl'
            )}
          >
            <header className="flex items-center gap-2.5 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-muted text-accent">
                <BarChart3 size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="analytics-title"
                  className="text-body font-semibold tracking-[-0.02em] text-foreground"
                >
                  Analytics
                </h2>
                <p className="text-micro text-muted-foreground">
                  Usage, quotas, and trends for your account
                </p>
              </div>
              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={() => refresh()}
                aria-label="Refresh"
                className="h-auto w-auto rounded-full p-2"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </Button>
              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={onClose}
                aria-label="Close"
                className="h-auto w-auto rounded-full p-2"
              >
                <X size={16} />
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {loading && !analytics ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Spinner size={22} />
                </div>
              ) : error && !analytics ? (
                <ErrorState
                  compact
                  title="Couldn't load analytics"
                  message={error}
                  onRetry={() => refresh()}
                  retrying={loading}
                />
              ) : analytics && totals ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-caption text-muted-foreground">Current plan</div>
                      <div className="text-title font-semibold tracking-[-0.02em]">
                        {analytics.plan.name}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void exportCsv()}
                        leftIcon={<Download size={13} />}
                        className="h-auto py-1.5 shadow-none"
                      >
                        CSV
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void exportPdf()}
                        leftIcon={<FileText size={13} />}
                        className="h-auto py-1.5 shadow-none"
                      >
                        PDF
                      </Button>
                      {isPlatformAdmin && onOpenAdmin ? (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={onOpenAdmin}
                          leftIcon={<Shield size={13} />}
                          className="h-auto py-1.5 shadow-none hover:shadow-none"
                        >
                          Admin
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    <StatCard label="Total Chats" value={formatNum(totals.chats)} />
                    <StatCard label="Total Tokens" value={formatNum(totals.tokens)} />
                    <StatCard
                      label="Images Generated"
                      value={formatNum(totals.imagesGenerated)}
 />
                    <StatCard
                      label="Voice Minutes"
                      value={formatNum(totals.voiceMinutes)}
 />
                    <StatCard
                      label="Deep Research"
                      value={formatNum(totals.deepResearchSessions)}
 />
                    <StatCard
                      label="Browser Sessions"
                      value={formatNum(totals.browserSessions)}
 />
                    <StatCard label="MCP Calls" value={formatNum(totals.mcpCalls)} />
                    <StatCard
                      label="Code Interpreter"
                      value={formatNum(totals.codeInterpreterRuns)}
 />
                    <StatCard
                      label="File Storage"
                      value={formatBytes(totals.fileStorageBytes)}
 />
                    <StatCard label="Plan" value={analytics.plan.planId} />
                  </div>

                  <section
                    className={cn(
                      'rounded-[18px] border border-black/[0.05] p-4',
                      'bg-black/[0.015] dark:border-white/[0.06] dark:bg-white/[0.025]'
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold tracking-[-0.015em]">
                        Usage trends
                      </h3>
                      <div className="flex rounded-full bg-surface-hover p-0.5">
                        {(['daily', 'weekly', 'monthly'] as ChartTab[]).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setChartTab(tab)}
                            className={cn(
                              'rounded-full px-2.5 py-1 text-micro font-medium capitalize transition',
                              chartTab === tab
                                ? 'bg-surface text-foreground shadow-token-sm'
                                : 'text-muted-foreground'
                            )}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>
                    <UsageChart points={chartPoints} height={140} />
                  </section>

                  <section>
                    <h3 className="mb-2.5 text-sm font-semibold tracking-[-0.015em]">
                      Remaining quotas
                    </h3>
                    <div className="space-y-3">
                      {(analytics.remaining || []).map((row) => {
                        const pct = row.unlimited ? 0 : row.percentUsed ?? 0;
                        const barColor =
                          pct >= 90
                            ? 'bg-red-500'
                            : pct >= 70
                              ? 'bg-amber-500'
                              : 'bg-accent';
                        const metric = row.metric as UsageMetric;
                        const usedLabel =
                          metric === 'file_storage_bytes'
                            ? formatBytes(row.used)
                            : formatNum(row.used);
                        const limitLabel = row.unlimited
                          ? 'Unlimited'
                          : metric === 'file_storage_bytes'
                            ? formatBytes(row.limit)
                            : formatNum(row.limit);
                        return (
                          <div key={row.metric} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium">
                                {METRIC_LABELS[metric] || row.metric}
                              </span>
                              <span className="text-micro tabular-nums text-muted-foreground">
                                {usedLabel}
                                {row.unlimited ? ' · Unlimited' : ` / ${limitLabel}`}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  barColor
                                )}
                                style={{
                                  width: row.unlimited
                                    ? '8%'
                                    : `${Math.min(100, pct)}%` }}
 />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
