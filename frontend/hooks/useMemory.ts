'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  clearAllMemories,
  createMemory,
  deleteMemory,
  downloadMemoriesJson,
  exportMemories,
  fetchMemories,
  fetchMemoryCategories,
  fetchMemorySettings,
  forgetMemory,
  recallMemoryByKey,
  retrieveRelevantMemories,
  summarizeChatMemories,
  updateMemory,
  updateMemorySettings,
  type MemoryCategory,
  type MemoryItem,
  type MemoryScope,
  type MemorySettings,
} from '@/lib/memory';

export interface UseMemoryOptions {
  /** When false, skip the initial network fetch (e.g. panel closed). */
  enabled?: boolean;
  /** Active chat — enables “Summarize this chat” against /memory/summarize. */
  chatId?: string | null;
}

function mergeById(primary: MemoryItem[], secondary: MemoryItem[]): MemoryItem[] {
  const map = new Map<string, MemoryItem>();
  for (const m of [...secondary, ...primary]) {
    if (m?.id) map.set(m.id, m);
  }
  return Array.from(map.values());
}

export function useMemory({ enabled = true, chatId = null }: UseMemoryOptions = {}) {
  const [settings, setSettings] = useState<MemorySettings | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<MemoryCategory[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MemoryCategory | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const debouncedQuery = useDebouncedValue(query, 280);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const cats = await fetchMemoryCategories();
        if (!cancelled && cats.length) setCategories(cats);
      } catch {
        /* keep hardcoded fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const q = debouncedQuery.trim();
        const [nextSettings, result, semantic, recalled] = await Promise.all([
          fetchMemorySettings(),
          fetchMemories({
            q,
            category,
            limit: 100,
            sort: 'updatedAt',
          }),
          q.length >= 3
            ? retrieveRelevantMemories(q, 8).catch(() => ({ memories: [], count: 0 }))
            : Promise.resolve({ memories: [] as MemoryItem[], count: 0 }),
          q && !/\s/.test(q)
            ? recallMemoryByKey(q).catch(() => ({ found: false, memory: null }))
            : Promise.resolve({ found: false, memory: null as MemoryItem | null }),
        ]);
        if (cancelled) return;
        setSettings(nextSettings);

        let list = result.memories;
        if (semantic.memories?.length) {
          const semanticFiltered =
            category === 'all'
              ? semantic.memories
              : semantic.memories.filter((m) => m.category === category);
          list = mergeById(list, semanticFiltered);
        }
        if (recalled.found && recalled.memory) {
          if (category === 'all' || recalled.memory.category === category) {
            list = mergeById(list, [recalled.memory]);
          }
        }
        setMemories(list);
        setTotal(Math.max(result.total, list.length));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load memories');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, debouncedQuery, category, reloadToken]);

  const refreshSettings = useCallback(async () => {
    const next = await fetchMemorySettings();
    setSettings(next);
    return next;
  }, []);

  const refreshMemories = useCallback(async () => {
    setReloadToken((t) => t + 1);
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    setIsSaving(true);
    try {
      const next = await updateMemorySettings({ enabled: value });
      setSettings(next);
      return next;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const saveSettings = useCallback(
    async (
      patch: Partial<{
        enabled: boolean;
        profile: Partial<MemorySettings['profile']>;
        preferences: Partial<MemorySettings['preferences']>;
      }>
    ) => {
      setIsSaving(true);
      try {
        const next = await updateMemorySettings(patch);
        setSettings(next);
        return next;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const addMemory = useCallback(
    async (input: { content: string; category?: MemoryCategory; key?: string }) => {
      setIsSaving(true);
      try {
        const result = await createMemory(input);
        setReloadToken((t) => t + 1);
        return result;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const editMemory = useCallback(
    async (
      id: string,
      patch: Partial<{
        content: string;
        category: MemoryCategory;
        key: string | null;
        importance: number;
        scope: MemoryScope;
        expiresAt: string | null;
      }>
    ) => {
      setIsSaving(true);
      try {
        const result = await updateMemory(id, patch);
        setMemories((prev) => prev.map((m) => (m.id === id ? result.memory : m)));
        return result;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const setMemoryScope = useCallback(
    async (id: string, scope: MemoryScope, expiresAt?: string | null) => {
      setIsSaving(true);
      try {
        const result = await updateMemory(id, {
          scope,
          ...(scope === 'temporary'
            ? expiresAt
              ? { expiresAt }
              : {}
            : { expiresAt: null }),
        });
        setMemories((prev) => prev.map((m) => (m.id === id ? result.memory : m)));
        return result;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const removeMemory = useCallback(async (id: string) => {
    setIsSaving(true);
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } finally {
      setIsSaving(false);
    }
  }, []);

  const forget = useCallback(
    async (input: { memoryId?: string; content?: string; chatId?: string | null }) => {
      setIsSaving(true);
      try {
        const result = await forgetMemory(input);
        if (result.deleted) setReloadToken((t) => t + 1);
        return result;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const clearAll = useCallback(async () => {
    setIsSaving(true);
    try {
      const result = await clearAllMemories();
      setMemories([]);
      setTotal(0);
      return result;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const exportAll = useCallback(async () => {
    const blob = await exportMemories();
    downloadMemoriesJson(blob);
  }, []);

  const summarizeActiveChat = useCallback(async () => {
    if (!chatId) throw new Error('No active chat to summarize');
    setIsSaving(true);
    try {
      const result = await summarizeChatMemories(chatId);
      setReloadToken((t) => t + 1);
      return result;
    } finally {
      setIsSaving(false);
    }
  }, [chatId]);

  return {
    settings,
    memories,
    total,
    categories,
    query,
    setQuery,
    category,
    setCategory,
    isLoading,
    isSaving,
    error,
    chatId,
    refreshSettings,
    refreshMemories,
    setEnabled,
    saveSettings,
    addMemory,
    editMemory,
    setMemoryScope,
    removeMemory,
    forget,
    clearAll,
    exportAll,
    summarizeActiveChat,
  };
}
