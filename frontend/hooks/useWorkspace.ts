'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContextSurface, WorkspaceTab } from '@/lib/workspace/types';

export interface UseWorkspaceOptions {
  /** When canvas panel opens/closes, sync tab highlight. */
  isCanvasOpen?: boolean;
  /** When deep research is enabled. */
  deepResearchEnabled?: boolean;
}

function tabToContext(tab: WorkspaceTab): ContextSurface {
  switch (tab) {
    case 'chat':
      return 'conversation';
    case 'canvas':
      return 'canvas';
    case 'files':
      return 'files';
    case 'research':
      return 'research';
    case 'memory':
      return 'memory';
    case 'tasks':
      return 'tasks';
    case 'automation':
      return 'automation';
    default:
      return 'conversation';
  }
}

/**
 * Coordinates workspace tabs + intelligent context panel.
 * Side-effects (open canvas, enable research, etc.) are handled by the page
 * via onTabChange callbacks — this hook only owns UI state.
 */
export function useWorkspace({
  isCanvasOpen = false,
  deepResearchEnabled = false,
}: UseWorkspaceOptions = {}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');
  // Stay collapsed until a conversation, project, PDF, image, or research
  // session explicitly needs context (opened via openContext / selectTab).
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSurface, setContextSurface] = useState<ContextSurface>('conversation');
  const [dockExpanded, setDockExpanded] = useState(false);

  // Sync highlight when canvas opens from elsewhere
  useEffect(() => {
    if (isCanvasOpen && activeTab === 'chat') {
      // Don't force-switch tab — user may want chat+canvas together.
      // Only update context surface if currently on conversation.
      setContextSurface((prev) => (prev === 'conversation' ? 'canvas' : prev));
      setContextOpen(true);
    }
  }, [isCanvasOpen, activeTab]);

  useEffect(() => {
    if (deepResearchEnabled && contextSurface === 'conversation') {
      setContextSurface('research');
      setContextOpen(true);
    }
  }, [deepResearchEnabled, contextSurface]);

  const selectTab = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab);
    setContextSurface(tabToContext(tab));
    if (tab !== 'chat') setContextOpen(true);
  }, []);

  const openContext = useCallback((surface?: ContextSurface) => {
    if (surface) setContextSurface(surface);
    setContextOpen(true);
  }, []);

  const closeContext = useCallback(() => setContextOpen(false), []);

  const toggleContext = useCallback(() => {
    setContextOpen((v) => !v);
  }, []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      selectTab,
      contextOpen,
      contextSurface,
      setContextSurface,
      openContext,
      closeContext,
      toggleContext,
      dockExpanded,
      setDockExpanded,
    }),
    [
      activeTab,
      selectTab,
      contextOpen,
      contextSurface,
      openContext,
      closeContext,
      toggleContext,
      dockExpanded,
    ]
  );

  return value;
}
