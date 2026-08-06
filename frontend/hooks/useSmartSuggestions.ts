'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildRecommendations,
  buildSmartSuggestions,
  type SmartSuggestion,
  type SuggestionContext,
} from '@/lib/suggestions';
import { fetchMemories, type MemoryItem } from '@/lib/memory';
import type { ChatSummary, Project } from '@/lib/types';

export interface UseSmartSuggestionsInput {
  activeProject?: Project | null;
  recentChats?: ChatSummary[];
  recentProjects?: Project[];
  knowledgeFiles?: string[];
  /** When false, skip memory fetch (e.g. home not visible). */
  enabled?: boolean;
  limit?: number;
}

export function useSmartSuggestions({
  activeProject = null,
  recentChats = [],
  recentProjects = [],
  knowledgeFiles = [],
  enabled = true,
  limit = 6,
}: UseSmartSuggestionsInput) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoadingMemories(true);
    void fetchMemories({ limit: 24, sort: 'importance' })
      .then((result) => {
        if (!cancelled) setMemories(result.memories || []);
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMemories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const ctx: SuggestionContext = useMemo(
    () => ({
      activeProject,
      recentChats,
      recentProjects,
      memories,
      knowledgeFiles,
      limit,
    }),
    [activeProject, recentChats, recentProjects, memories, knowledgeFiles, limit]
  );

  const suggestions: SmartSuggestion[] = useMemo(
    () => buildSmartSuggestions(ctx),
    [ctx]
  );

  const recommendations = useMemo(() => buildRecommendations(ctx), [ctx]);

  return {
    suggestions,
    recommendations,
    memories,
    loadingMemories,
  };
}
