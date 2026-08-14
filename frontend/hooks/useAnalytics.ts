'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadAnalyticsCsv,
  fetchAnalyticsIdentity,
  fetchExportPayload,
  fetchUserAnalytics,
  type AnalyticsIdentity,
  type UserAnalytics,
} from '@/lib/analytics';
import { getUserFriendlyError } from '@/lib/userFacingError';

export interface UseAnalyticsOptions {
  enabled?: boolean;
  onError?: (message: string) => void;
}

export function useAnalytics({ enabled = true, onError }: UseAnalyticsOptions = {}) {
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [identity, setIdentity] = useState<AnalyticsIdentity | null>(null);
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
        const [next, me] = await Promise.all([
          fetchUserAnalytics(),
          fetchAnalyticsIdentity().catch(() => null),
        ]);
        if (cancelled) return;
        setAnalytics(next);
        if (me) setIdentity(me);
      } catch (err) {
        if (cancelled) return;
        const message = getUserFriendlyError(err, {
          fallback: 'Unable to load analytics',
        });
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
      await downloadAnalyticsCsv('user');
    } catch (err) {
      const message = getUserFriendlyError(err, { fallback: 'CSV export failed' });
      onErrorRef.current?.(message);
    }
  }, []);

  const exportPdf = useCallback(async () => {
    try {
      const payload = await fetchExportPayload('user', 'pdf');
      const stamp = new Date().toISOString().slice(0, 10);
      const { exportAnalyticsPdf } = await import('@/lib/analytics/exportPdf');
      await exportAnalyticsPdf(
        payload.title || 'VANI AI — Usage Analytics',
        (payload.rows || []) as [string, string | number][],
        `vani-analytics-${stamp}.pdf`
      );
    } catch (err) {
      const message = getUserFriendlyError(err, { fallback: 'PDF export failed' });
      onErrorRef.current?.(message);
    }
  }, []);

  return {
    analytics,
    identity,
    loading,
    error,
    refresh,
    exportCsv,
    exportPdf,
    isPlatformAdmin: identity?.isPlatformAdmin ?? false,
  };
}
