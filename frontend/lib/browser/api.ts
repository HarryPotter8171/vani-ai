import { getApiBaseUrl } from '@/lib/constants';
import { apiFetch, getCachedAccessToken } from '@/lib/apiClient';
import type {
  BrowserPermission,
  BrowserRun,
  PendingApproval,
  PermissionChoice,
  StartBrowserRunInput,
} from './types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && res.status !== 202) {
    const { throwIfGateBody } = await import('@/lib/billing/gateError');
    throwIfGateBody(res.status, data);
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    );
  }
  return data as T;
}

export async function startBrowserRun(input: StartBrowserRunInput): Promise<{
  ok: boolean;
  runId: string;
  needsApproval?: boolean;
  approval?: PendingApproval | null;
  snapshot: BrowserRun;
  error?: string;
}> {
  const res = await apiFetch('/browser/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function fetchBrowserRun(runId: string): Promise<BrowserRun> {
  const res = await apiFetch(`/browser/runs/${runId}`);
  const data = await parseJson<{ run: BrowserRun }>(res);
  return data.run;
}

export async function fetchBrowserRuns(): Promise<BrowserRun[]> {
  const res = await apiFetch('/browser/runs');
  const data = await parseJson<{ runs: BrowserRun[] }>(res);
  return data.runs || [];
}

export async function pauseBrowserRun(runId: string): Promise<BrowserRun> {
  const res = await apiFetch(`/browser/runs/${runId}/pause`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ run: BrowserRun }>(res);
  return data.run;
}

export async function resumeBrowserRun(runId: string): Promise<BrowserRun> {
  const res = await apiFetch(`/browser/runs/${runId}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ run: BrowserRun }>(res);
  return data.run;
}

export async function stopBrowserRun(runId: string): Promise<BrowserRun> {
  const res = await apiFetch(`/browser/runs/${runId}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ run: BrowserRun }>(res);
  return data.run;
}

export async function fetchBrowserApprovals(): Promise<PendingApproval[]> {
  const res = await apiFetch('/browser/approvals');
  const data = await parseJson<{ approvals: PendingApproval[] }>(res);
  return data.approvals || [];
}

export async function resolveBrowserApproval(
  approvalId: string,
  choice: PermissionChoice
): Promise<void> {
  const res = await apiFetch(`/browser/approvals/${approvalId}`, {
    method: 'POST',
    body: JSON.stringify({ choice }),
  });
  await parseJson(res);
}

export async function fetchBrowserPermissions(): Promise<BrowserPermission[]> {
  const res = await apiFetch('/browser/permissions');
  const data = await parseJson<{ permissions: BrowserPermission[] }>(res);
  return data.permissions || [];
}

export function browserScreenshotUrl(runId: string, screenshotId: string): string {
  const base = `${getApiBaseUrl()}/browser/runs/${runId}/screenshots/${screenshotId}`;
  const params = new URLSearchParams();
  const token = getCachedAccessToken();
  if (token) params.set('access_token', token);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
