import { apiFetch } from '@/lib/apiClient';

export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'groq'
  | 'ollama';

export interface ModelOption {
  key: string;
  id: string;
  provider: ProviderId;
  displayName: string;
  capabilities: string[];
  contextWindow?: number;
  enabled: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  configured: boolean;
}

export interface ModelsCatalog {
  models: ModelOption[];
  providers: ProviderInfo[];
  defaults: { model: string; autoRoute: boolean };
}

export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  provider?: ProviderId | string;
  model?: string;
  modelKey?: string;
}

export interface TurnMeta {
  model?: string;
  provider?: ProviderId | string;
  modelKey?: string;
  reason?: string;
  displayName?: string;
  fallback?: boolean;
}

export const AUTO_MODEL_KEY = 'auto';

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Claude',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  ollama: 'Ollama',
};

export const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#4285F4',
  openai: '#10a37f',
  anthropic: '#d97757',
  openrouter: '#6566F1',
  groq: '#F55036',
  ollama: '#1a1a1a',
};

let catalogCache: ModelsCatalog | null = null;
let catalogPromise: Promise<ModelsCatalog> | null = null;

export async function fetchModelsCatalog(force = false): Promise<ModelsCatalog> {
  if (!force && catalogCache) return catalogCache;
  if (!force && catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    const res = await apiFetch('/models?all=1');
    if (!res.ok) throw new Error('Unable to load models');
    const data = (await res.json()) as ModelsCatalog;
    catalogCache = data;
    return data;
  })();

  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}

export function formatCost(usd?: number): string {
  if (usd == null || Number.isNaN(usd)) return '—';
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export function formatLatency(ms?: number): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokens(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
