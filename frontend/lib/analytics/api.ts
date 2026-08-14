import { apiFetch, getAccessToken } from '@/lib/apiClient';
import { getApiBaseUrl } from '@/lib/constants';
import type {
  AdminDashboard,
  AnalyticsIdentity,
  AnalyticsLogEntry,
  SystemHealth,
  UserAnalytics,
} from './types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchAnalyticsIdentity(): Promise<AnalyticsIdentity> {
  const res = await apiFetch('/analytics/me');
  return parseJson(res);
}

export async function fetchUserAnalytics(): Promise<UserAnalytics> {
  const res = await apiFetch('/analytics/overview');
  const data = await parseJson<{ analytics: UserAnalytics }>(res);
  return data.analytics;
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  const res = await apiFetch('/analytics/admin/dashboard');
  const data = await parseJson<{ dashboard: AdminDashboard }>(res);
  return data.dashboard;
}

export async function fetchAdminHealth(): Promise<SystemHealth> {
  const res = await apiFetch('/analytics/admin/health');
  const data = await parseJson<{ health: SystemHealth }>(res);
  return data.health;
}

export async function fetchAdminLogs(limit = 50): Promise<AnalyticsLogEntry[]> {
  const res = await apiFetch(`/analytics/admin/logs?limit=${limit}`);
  const data = await parseJson<{ logs: AnalyticsLogEntry[] }>(res);
  return data.logs || [];
}

export async function fetchExportPayload(
  scope: 'user' | 'admin',
  format: 'csv' | 'pdf' | 'json' = 'pdf'
): Promise<{
  title?: string;
  rows?: [string, string | number][];
  analytics?: UserAnalytics;
  dashboard?: AdminDashboard;
}> {
  const path =
    scope === 'admin'
      ? `/analytics/admin/export?format=${format}`
      : `/analytics/export?format=${format}`;
  const res = await apiFetch(path);
  return parseJson(res);
}

/** Download CSV via authenticated fetch (blob). */
export async function downloadAnalyticsCsv(scope: 'user' | 'admin' = 'user'): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Unable to sign in. Please try again.');
  }
  const path =
    scope === 'admin' ? '/analytics/admin/export?format=csv' : '/analytics/export?format=csv';
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || 'Export failed');
  }
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename =
    scope === 'admin'
      ? `vani-admin-analytics-${stamp}.csv`
      : `vani-analytics-${stamp}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
