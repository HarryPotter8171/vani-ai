'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Cpu, Database, Download, FileText, HardDrive, MemoryStick, RefreshCw, Server, Shield, Timer, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';
import { useAdminAnalytics } from '@/hooks/useAdminAnalytics';
import { useToast } from '@/components/ui/Toast';
import UsageChart from '@/components/analytics/UsageChart';

export interface AdminDashboardProps {
  open: boolean;
  onClose: () => void;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type AdminTab = 'overview' | 'health' | 'logs';

function formatCents(cents: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD' }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MetricCard({
  label,
  value,
  hint }: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] border border-black/[0.05] px-3.5 py-3',
        'bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.03]'
      )}
    >
      <div className="text-micro font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-title font-semibold tracking-[-0.03em] tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-micro text-muted-foreground/80">{hint}</div>
      ) : null}
    </div>
  );
}

function HealthRow({
  icon: Icon,
  name,
  healthy,
  detail }: {
  icon: typeof Database;
  name: string;
  healthy: boolean;
  detail: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[14px] border px-3.5 py-3',
        healthy
          ? 'border-emerald-500/15 bg-emerald-500/[0.04]'
          : 'border-red-500/20 bg-red-500/[0.05]'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          healthy
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        )}
      >
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide',
              healthy
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/15 text-red-700 dark:text-red-300'
            )}
          >
            {healthy ? 'ok' : 'degraded'}
          </span>
        </div>
        <div className="truncate text-micro text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard({ open, onClose }: AdminDashboardProps) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<AdminTab>('overview');
  const { dashboard, health, logs, loading, error, refresh, exportCsv, exportPdf } =
    useAdminAnalytics({
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

  const modelRows = useMemo(() => {
    if (!dashboard?.modelUsage) return [];
    return Object.entries(dashboard.modelUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [dashboard]);

  const healthRows = useMemo(() => {
    if (!health) return [];
    const s = health.services;
    return [
      {
        icon: Database,
        name: 'MongoDB',
        healthy: !!s.mongodb?.healthy,
        detail: s.mongodb?.healthy ? 'Connected' : 'Unavailable' },
      {
        icon: Server,
        name: 'Redis',
        healthy: !!s.redis?.healthy,
        detail: s.redis?.configured
          ? s.redis.healthy
            ? 'Connected'
            : 'Unreachable'
          : 'Not configured'},
      {
        icon: Activity,
        name: 'Queue',
        healthy: !!s.queue?.healthy,
        detail: `In-process · avg ${Number(s.queue?.avgLatencyMs) || 0} ms` },
      {
        icon: HardDrive,
        name: 'Storage',
        healthy: !!s.storage?.healthy,
        detail:
          s.storage?.detail &&
          typeof s.storage.detail === 'object' &&
          'usedPct' in (s.storage.detail as object)
            ? `${(s.storage.detail as { usedPct?: number }).usedPct ?? '—'}% used`
            : 'Disk check' },
      {
        icon: Cpu,
        name: 'CPU',
        healthy: !!s.cpu?.healthy,
        detail:
          s.cpu?.usagePercent != null
            ? `${s.cpu.usagePercent}% · ${s.cpu.cores || '—'} cores`
            : 'Unavailable' },
      {
        icon: MemoryStick,
        name: 'Memory',
        healthy: !!s.memory?.healthy,
        detail: `RSS ${s.memory?.rssMB ?? '—'} MB · system ${s.memory?.systemUsedPct ?? '—'}%` },
      {
        icon: Timer,
        name: 'Uptime',
        healthy: true,
        detail: formatUptime(Number(health.uptimeSeconds) || 0) },
    ];
  }, [health]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close admin dashboard"
            className="absolute inset-0 modal-overlay"
            onClick={onClose}
 />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-dashboard-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn(
              'relative flex max-h-[min(920px,94vh)] w-full max-w-[960px] flex-col overflow-hidden',
              'rounded-[22px] border border-border',
              'bg-surface',
              'shadow-[0_24px_80px_rgba(0,0,0,0.2)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.6)]',
              'backdrop-blur-2xl'
            )}
          >
            <header className="flex items-center gap-2.5 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-muted text-accent">
                <Shield size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="admin-dashboard-title"
                  className="text-body font-semibold tracking-[-0.02em]"
                >
                  Admin Dashboard
                </h2>
                <p className="text-micro text-muted-foreground">
                  Platform metrics · system health · logs
                </p>
              </div>
              <button
                type="button"
                onClick={() => refresh()}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-surface-hover"
                aria-label="Refresh"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-surface-hover"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex items-center gap-1 border-b border-black/[0.04] px-4 py-2 dark:border-white/[0.05]">
              {([
                ['overview', 'Overview'],
                ['health', 'System health'],
                ['logs', 'Logs'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-caption font-medium transition',
                    tab === id
                      ? 'bg-foreground/[0.07] text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void exportCsv()}
                  className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] px-2.5 py-1 text-micro font-medium dark:border-white/[0.08]"
                >
                  <Download size={12} />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => void exportPdf()}
                  className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] px-2.5 py-1 text-micro font-medium dark:border-white/[0.08]"
                >
                  <FileText size={12} />
                  PDF
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {loading && !dashboard ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Spinner size={22} />
                </div>
              ) : error && !dashboard ? (
                <ErrorState
                  compact
                  title="Couldn't load admin dashboard"
                  message={error}
                  onRetry={() => refresh()}
                  retrying={loading}
                />
              ) : tab === 'overview' && dashboard ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MetricCard label="Total Users" value={formatNum(dashboard.users.total)} />
                    <MetricCard label="Active Users" value={formatNum(dashboard.users.active)} />
                    <MetricCard label="New Users (30d)" value={formatNum(dashboard.users.new)} />
                    <MetricCard label="Paid Users" value={formatNum(dashboard.users.paid)} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MetricCard
                      label="Revenue"
                      value={formatCents(dashboard.finance.revenueCents)}
                      hint={dashboard.finance.revenueSource}
 />
                    <MetricCard
                      label="API Cost"
                      value={formatCents(dashboard.finance.apiCostCents)}
                      hint="Estimated"
 />
                    <MetricCard
                      label="Profit Estimate"
                      value={formatCents(dashboard.finance.profitEstimateCents)}
 />
                    <MetricCard
                      label="Error Rate"
                      value={`${dashboard.performance.errorRate}%`}
                      hint={`${dashboard.performance.errorsToday} errors today`}
 />
                    <MetricCard
                      label="Avg Response"
                      value={`${dashboard.performance.averageResponseTimeMs} ms`}
 />
                    <MetricCard
                      label="Token Usage"
                      value={formatNum(dashboard.usage.tokens)}
 />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MetricCard
                      label="Image Usage"
                      value={formatNum(dashboard.usage.images)}
 />
                    <MetricCard
                      label="Voice Usage"
                      value={`${formatNum(dashboard.usage.voiceMinutes)} min`}
 />
                    <MetricCard
                      label="Model calls (tokens)"
                      value={formatNum(
                        Object.values(dashboard.modelUsage || {}).reduce(
                          (a, b) => a + b,
                          0
                        )
                      )}
 />
                    <MetricCard
                      label="MCP Calls"
                      value={formatNum(dashboard.usage.mcp)}
 />
                  </div>

                  <section
                    className={cn(
                      'rounded-[18px] border border-black/[0.05] p-4',
                      'bg-black/[0.015] dark:border-white/[0.06] dark:bg-white/[0.025]'
                    )}
                  >
                    <h3 className="mb-3 text-sm font-semibold tracking-[-0.015em]">
                      Platform daily usage
                    </h3>
                    <UsageChart
                      points={dashboard.charts.daily || []}
                      metricKey="api_requests"
                      height={140}
 />
                  </section>

                  {modelRows.length > 0 ? (
                    <section>
                      <h3 className="mb-2.5 text-sm font-semibold">Model usage</h3>
                      <div className="space-y-2">
                        {modelRows.map(([model, tokens]) => {
                          const max = modelRows[0]?.[1] || 1;
                          const pct = Math.max(4, (tokens / max) * 100);
                          return (
                            <div key={model} className="space-y-1">
                              <div className="flex justify-between gap-2 text-caption">
                                <span className="truncate font-medium">{model}</span>
                                <span className="tabular-nums text-muted-foreground">
                                  {formatNum(tokens)} tok
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                                <div
                                  className="h-full rounded-full bg-accent"
                                  style={{ width: `${pct}%` }}
 />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : tab === 'health' ? (
                <div className="space-y-2.5">
                  <div className="mb-3 text-caption text-muted-foreground">
                    Status:{' '}
                    <span className="font-medium text-foreground">
                      {health?.status || '—'}
                    </span>
                    {health?.timestamp ? (
                      <span> · {new Date(health.timestamp).toLocaleString()}</span>
                    ) : null}
                  </div>
                  {healthRows.map((row) => (
                    <HealthRow key={row.name} {...row} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.length === 0 ? (
                    <PremiumEmpty
                      size="sm"
                      icon={Activity}
                      title="No recent analytics logs yet"
                      description="API and tool activity will show up here as it happens."
                      className="py-10"
                    />
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className={cn(
                          'rounded-[12px] border border-black/[0.04] px-3 py-2.5',
                          'dark:border-white/[0.05]',
                          log.type === 'error' && 'border-red-500/15 bg-red-500/[0.03]'
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro">
                          <span className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-medium uppercase tracking-wide dark:bg-white/[0.07]">
                            {log.type}
                          </span>
                          <span className="font-medium tabular-nums text-muted-foreground">
                            {log.method} {log.statusCode ?? ''}
                          </span>
                          <span className="truncate text-foreground">
                            {log.path || log.tool || log.model || '—'}
                          </span>
                          {log.latencyMs != null ? (
                            <span className="ml-auto tabular-nums text-muted-foreground">
                              {Math.round(log.latencyMs)} ms
                            </span>
                          ) : null}
                        </div>
                        {log.errorMessage ? (
                          <div className="mt-1 truncate text-micro text-red-600 dark:text-red-400">
                            {log.errorMessage}
                          </div>
                        ) : null}
                        <div className="mt-0.5 text-micro text-muted-foreground/80">
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleString()
                            : ''}
                          {log.requestId ? ` · ${log.requestId.slice(0, 8)}` : ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
