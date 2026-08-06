'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadAnalyticsCsv,
  fetchAdminDashboard,
  fetchAdminHealth,
  fetchAdminLogs,
  fetchExportPayload,
  type AdminDashboard,
  type AnalyticsLogEntry,
  type SystemHealth,
} from '@/lib/analytics';

export interface UseAdminAnalyticsOptions {
  enabled?: boolean;
  onError?: (message: string) => void;
}

export function useAdminAnalytics({
  enabled = true,
  onError,
}: UseAdminAnalyticsOptions = {}) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [logs, setLogs] = useState<AnalyticsLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [dash, h, l] = await Promise.all([
          fetchAdminDashboard(),
          fetchAdminHealth(),
          fetchAdminLogs(40),
        ]);
        if (cancelled) return;
        setDashboard(dash);
        setHealth(h);
        setLogs(l);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Unable to load admin analytics';
        setError(message);
        onErrorRef.current?.(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  const exportCsv = useCallback(async () => {
    try {
      await downloadAnalyticsCsv('admin');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CSV export failed';
      onErrorRef.current?.(message);
    }
  }, []);

  const exportPdf = useCallback(async () => {
    try {
      const payload = await fetchExportPayload('admin', 'pdf');
      const stamp = new Date().toISOString().slice(0, 10);
      const { exportAnalyticsPdf } = await import('@/lib/analytics/exportPdf');
      await exportAnalyticsPdf(
        payload.title || 'VANI AI — Admin Dashboard',
        (payload.rows || []) as [string, string | number][],
        `vani-admin-analytics-${stamp}.pdf`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF export failed';
      onErrorRef.current?.(message);
    }
  }, []);

  return {
    dashboard,
    health,
    logs,
    loading,
    error,
    refresh,
    exportCsv,
    exportPdf,
  };
}
