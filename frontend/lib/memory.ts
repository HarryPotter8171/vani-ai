import { apiFetch } from '@/lib/apiClient';

export const MEMORY_CATEGORIES = [
  'profile',
  'preference',
  'fact',
  'project',
  'goal',
  'task',
  'tool',
  'conversation',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryScope = 'temporary' | 'long_term' | 'pinned';

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  profile: 'User Profile',
  preference: 'Preferences',
  fact: 'Long-term Facts',
  project: 'Projects',
  goal: 'Goals',
  task: 'Ongoing Tasks',
  tool: 'Tools',
  conversation: 'Conversation',
};

export type MemorySource = 'auto' | 'manual' | 'tool' | 'summary';

export interface MemoryItem {
  id: string;
  userId: string;
  category: MemoryCategory;
  content: string;
  key: string | null;
  importance: number;
  scope?: MemoryScope;
  confidence?: number;
  tags?: string[];
  source: MemorySource;
  chatId: string | null;
  sourceChatId?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoryProfile {
  preferredName: string;
  preferredLanguage: string;
  timezone: string;
  profession: string;
  interests: string[];
}

export interface MemoryPreferences {
  responseStyle: string;
  codingStyle: string;
  favoriteModel: string;
  uiPreferences: string;
}

export interface MemorySettings {
  enabled: boolean;
  profile: MemoryProfile;
  preferences: MemoryPreferences;
}

export interface MemoryListResult {
  memories: MemoryItem[];
  total: number;
  limit: number;
  offset: number;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchMemorySettings(): Promise<MemorySettings> {
  const res = await apiFetch('/memory/settings');
  return parseJson(res);
}

export async function updateMemorySettings(
  patch: Partial<{ enabled: boolean; profile: Partial<MemoryProfile>; preferences: Partial<MemoryPreferences> }>
): Promise<MemorySettings> {
  const res = await apiFetch('/memory/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function fetchMemories(params: {
  q?: string;
  category?: MemoryCategory | 'all';
  limit?: number;
  offset?: number;
  sort?: 'updatedAt' | 'importance' | 'createdAt';
} = {}): Promise<MemoryListResult> {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.category && params.category !== 'all') qs.set('category', params.category);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  if (params.sort) qs.set('sort', params.sort);

  const path = qs.toString() ? `/memory?${qs.toString()}` : '/memory';
  const res = await apiFetch(path);
  return parseJson(res);
}

export async function createMemory(input: {
  content: string;
  key?: string;
  category?: MemoryCategory;
  importance?: number;
}): Promise<{ memory: MemoryItem; deduplicated: boolean }> {
  const res = await apiFetch('/memory', {
    method: 'POST',
    body: JSON.stringify({ ...input, source: 'manual' }),
  });
  return parseJson(res);
}

export async function updateMemory(
  id: string,
  patch: Partial<{
    content: string;
    key: string | null;
    category: MemoryCategory;
    importance: number;
    scope: MemoryScope;
    expiresAt: string | null;
  }>
): Promise<{ memory: MemoryItem }> {
  const res = await apiFetch(`/memory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function deleteMemory(id: string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`/memory/${id}`, {
    method: 'DELETE',
  });
  return parseJson(res);
}

export async function forgetMemory(input: {
  memoryId?: string;
  content?: string;
  chatId?: string | null;
}): Promise<{ deleted: boolean; count?: number }> {
  const res = await apiFetch('/memory/forget', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function clearAllMemories(): Promise<{ deleted: number }> {
  const res = await apiFetch('/memory/clear', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function exportMemories(): Promise<Blob> {
  const res = await apiFetch('/memory/export');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Export failed');
  }
  return res.blob();
}

export async function fetchMemoryCategories(): Promise<MemoryCategory[]> {
  const res = await apiFetch('/memory/categories');
  const data = await parseJson<{ categories: string[] }>(res);
  const allowed = new Set<string>(MEMORY_CATEGORIES);
  return (data.categories || []).filter((c): c is MemoryCategory => allowed.has(c));
}

export async function recallMemoryByKey(
  key: string
): Promise<{ found: boolean; memory: MemoryItem | null }> {
  const qs = new URLSearchParams({ key: key.trim() });
  const res = await apiFetch(`/memory/recall?${qs.toString()}`);
  return parseJson(res);
}

export async function retrieveRelevantMemories(
  query: string,
  topK = 8
): Promise<{ memories: MemoryItem[]; count: number }> {
  const res = await apiFetch('/memory/retrieve', {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  });
  return parseJson(res);
}

export async function summarizeChatMemories(
  chatId: string
): Promise<{ memories: MemoryItem[]; summary: MemoryItem | null }> {
  const res = await apiFetch('/memory/summarize', {
    method: 'POST',
    body: JSON.stringify({ chatId }),
  });
  return parseJson(res);
}

export function downloadMemoriesJson(blob: Blob, filename = 'vani-memories.json') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
