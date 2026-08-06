'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aiEditCanvas,
  autosaveCanvas,
  closeCanvas as closeCanvasApi,
  createCanvas,
  duplicateCanvas as duplicateCanvasApi,
  listCanvases,
  listCanvasVersions,
  pinCanvas as pinCanvasApi,
  renameCanvas as renameCanvasApi,
  restoreCanvasVersion,
  getCanvasVersion,
  type CanvasAiAction,
  type CanvasDocument,
  type CanvasSaveStatus,
  type CanvasType,
  type CanvasVersionSummary,
  type CanvasViewMode,
  artifactToCanvasInput,
  inferCanvasTypeFromContent,
  shouldAutoOpenCanvasFromMessage,
  titleFromContent,
} from '@/lib/canvas';
import type { Artifact } from '@/lib/artifacts';
import { GateDenialError, type GateDenial } from '@/lib/billing/gateError';

const AUTOSAVE_MS = 900;
const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 360;
const MAX_WIDTH_RATIO = 0.62;

interface UseCanvasOptions {
  chatId: string | null;
  onError?: (message: string) => void;
  onGateDenial?: (denial: GateDenial) => void;
}

export function useCanvas({ chatId, onError, onGateDenial }: UseCanvasOptions) {
  const [documents, setDocuments] = useState<Record<string, CanvasDocument>>({});
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, CanvasSaveStatus>>({});
  const [viewMode, setViewMode] = useState<Record<string, CanvasViewMode>>({});
  const [conflicts, setConflicts] = useState<Record<string, CanvasDocument | null>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [versions, setVersions] = useState<CanvasVersionSummary[]>([]);
  const [diffBaseline, setDiffBaseline] = useState<string | null>(null);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [mobileSurface, setMobileSurface] = useState<'chat' | 'canvas'>('chat');

  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seenArtifactIds = useRef(new Set<string>());
  const seenLongMessageIds = useRef(new Set<string>());
  const documentsRef = useRef(documents);
  const draftsRef = useRef(drafts);
  const titlesRef = useRef(titles);
  // Keep onError out of effect/callback deps — inline `(msg) => showToast(msg)`
  // from parents would otherwise retrigger the canvas load effect forever.
  const onErrorRef = useRef(onError);
  const onGateDenialRef = useRef(onGateDenial);
  useEffect(() => {
    onErrorRef.current = onError;
    onGateDenialRef.current = onGateDenial;
  }, [onError, onGateDenial]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(() => {
    titlesRef.current = titles;
  }, [titles]);

  const reportError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof GateDenialError) {
      onGateDenialRef.current?.(err.denial);
      if (!onGateDenialRef.current) onErrorRef.current?.(err.message);
      return;
    }
    const message = err instanceof Error ? err.message : fallback;
    onErrorRef.current?.(message);
  }, []);

  const upsertDocument = useCallback((doc: CanvasDocument) => {
    setDocuments((prev) => ({ ...prev, [doc.id]: doc }));
    setDrafts((prev) => ({ ...prev, [doc.id]: prev[doc.id] ?? doc.content }));
    setTitles((prev) => ({ ...prev, [doc.id]: prev[doc.id] ?? doc.title }));
  }, []);

  const openDocument = useCallback((doc: CanvasDocument) => {
    upsertDocument(doc);
    setOpenIds((prev) => (prev.includes(doc.id) ? prev : [...prev, doc.id]));
    setActiveId(doc.id);
    setIsOpen(true);
    setMobileSurface('canvas');
    setSaveStatus((prev) => ({ ...prev, [doc.id]: prev[doc.id] ?? 'saved' }));
    setViewMode((prev) => ({
      ...prev,
      [doc.id]: prev[doc.id] ?? (doc.type === 'code' || doc.type === 'json' || doc.type === 'csv' || doc.type === 'plaintext' ? 'edit' : 'split'),
    }));
  }, [upsertDocument]);

  const resetCanvasState = useCallback(() => {
    for (const timer of Object.values(autosaveTimers.current)) clearTimeout(timer);
    autosaveTimers.current = {};
    setDocuments({});
    setOpenIds([]);
    setActiveId(null);
    setDrafts({});
    setTitles({});
    setSaveStatus({});
    setViewMode({});
    setConflicts({});
    setIsOpen(false);
    setIsFullscreen(false);
    setVersions([]);
    setDiffBaseline(null);
    setMobileSurface('chat');
    seenArtifactIds.current = new Set();
    seenLongMessageIds.current = new Set();
  }, []);

  // Load open canvases for the active chat.
  useEffect(() => {
    let cancelled = false;
    if (!chatId || chatId.startsWith('temp-')) {
      return;
    }

    (async () => {
      try {
        const result = await listCanvases({ chatId });
        if (cancelled) return;
        for (const doc of result.items) upsertDocument(doc);
        if (result.items.length) {
          setOpenIds(result.items.map((d) => d.id));
          setActiveId((current) => current ?? result.items[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) reportError(err, 'Unable to load canvases');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, upsertDocument, reportError]);

  const flushAutosave = useCallback(
    async (id: string) => {
      const doc = documentsRef.current[id];
      if (!doc) return;
      const content = draftsRef.current[id] ?? doc.content;
      const title = titlesRef.current[id] ?? doc.title;
      if (content === doc.content && title === doc.title) {
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
        return;
      }

      setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
      try {
        const result = await autosaveCanvas(id, {
          content,
          title,
          expectedRevision: doc.revision,
        });
        upsertDocument(result.canvas);
        setConflicts((prev) => ({ ...prev, [id]: null }));
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
      } catch (err) {
        const conflict = (err as { current?: CanvasDocument; code?: string }).current;
        if ((err as { code?: string }).code === 'CONFLICT' && conflict) {
          setConflicts((prev) => ({ ...prev, [id]: conflict }));
          setSaveStatus((prev) => ({ ...prev, [id]: 'conflict' }));
          return;
        }
        setSaveStatus((prev) => ({ ...prev, [id]: 'error' }));
        reportError(err, 'Autosave failed');
      }
    },
    [reportError, upsertDocument]
  );

  const scheduleAutosave = useCallback(
    (id: string) => {
      setSaveStatus((prev) => ({ ...prev, [id]: 'dirty' }));
      if (autosaveTimers.current[id]) clearTimeout(autosaveTimers.current[id]);
      autosaveTimers.current[id] = setTimeout(() => {
        void flushAutosave(id);
      }, AUTOSAVE_MS);
    },
    [flushAutosave]
  );

  const setDraftContent = useCallback(
    (id: string, content: string) => {
      setDrafts((prev) => ({ ...prev, [id]: content }));
      scheduleAutosave(id);
    },
    [scheduleAutosave]
  );

  const setDraftTitle = useCallback(
    (id: string, title: string) => {
      setTitles((prev) => ({ ...prev, [id]: title }));
      scheduleAutosave(id);
    },
    [scheduleAutosave]
  );

  const createAndOpen = useCallback(
    async (input: {
      title?: string;
      type: CanvasType;
      content?: string;
      language?: string | null;
      sourceArtifactId?: string | null;
      syncFromArtifact?: boolean;
    }) => {
      try {
        const doc = await createCanvas({
          ...input,
          chatId: chatId && !chatId.startsWith('temp-') ? chatId : null,
        });
        openDocument(doc);
        return doc;
      } catch (err) {
        reportError(err, 'Unable to create canvas');
        return null;
      }
    },
    [chatId, openDocument, reportError]
  );

  const openFromArtifact = useCallback(
    async (artifact: Artifact) => {
      const input = artifactToCanvasInput(
        artifact,
        chatId && !chatId.startsWith('temp-') ? chatId : null
      );
      const doc = await createAndOpen(input);
      if (doc) seenArtifactIds.current.add(artifact.id);
      return doc;
    },
    [chatId, createAndOpen]
  );

  /** Auto-open canvases for new artifacts / long assistant messages. */
  const handleAssistantContent = useCallback(
    async (messageId: string, content: string, artifacts: Artifact[]) => {
      if (!shouldAutoOpenCanvasFromMessage(content, artifacts)) return;

      for (const artifact of artifacts) {
        if (seenArtifactIds.current.has(artifact.id)) {
          // Keep streaming artifact canvases in sync.
          const existingId = Object.values(documentsRef.current).find(
            (d) => d.sourceArtifactId === artifact.id
          )?.id;
          if (existingId && !draftsRef.current[existingId]?.length) {
            setDrafts((prev) => ({ ...prev, [existingId]: artifact.content }));
          } else if (existingId) {
            const doc = documentsRef.current[existingId];
            if (doc && draftsRef.current[existingId] === doc.content) {
              setDrafts((prev) => ({ ...prev, [existingId]: artifact.content }));
              setDocuments((prev) =>
                prev[existingId]
                  ? {
                      ...prev,
                      [existingId]: { ...prev[existingId], content: artifact.content },
                    }
                  : prev
              );
            }
          }
          continue;
        }
        seenArtifactIds.current.add(artifact.id);
        await openFromArtifact(artifact);
      }

      if (
        artifacts.length === 0 &&
        !seenLongMessageIds.current.has(messageId) &&
        content.trim().length >= 1200
      ) {
        seenLongMessageIds.current.add(messageId);
        await createAndOpen({
          title: titleFromContent(content),
          type: inferCanvasTypeFromContent(content),
          content,
        });
      }
    },
    [createAndOpen, openFromArtifact]
  );

  const closeTab = useCallback(
    async (id: string) => {
      if (autosaveTimers.current[id]) {
        clearTimeout(autosaveTimers.current[id]);
        await flushAutosave(id);
      }
      try {
        await closeCanvasApi(id);
      } catch (err) {
        reportError(err, 'Unable to close canvas');
      }
      setOpenIds((prev) => {
        const next = prev.filter((x) => x !== id);
        setActiveId((current) => {
          if (current !== id) return current;
          return next[next.length - 1] ?? null;
        });
        if (next.length === 0) {
          setIsOpen(false);
          setIsFullscreen(false);
          setMobileSurface('chat');
        }
        return next;
      });
    },
    [flushAutosave, reportError]
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      setTitles((prev) => ({ ...prev, [id]: title }));
      try {
        const doc = await renameCanvasApi(id, title);
        upsertDocument(doc);
      } catch (err) {
        reportError(err, 'Unable to rename canvas');
      }
    },
    [reportError, upsertDocument]
  );

  const duplicate = useCallback(
    async (id: string) => {
      try {
        const doc = await duplicateCanvasApi(id);
        openDocument(doc);
      } catch (err) {
        reportError(err, 'Unable to duplicate canvas');
      }
    },
    [openDocument, reportError]
  );

  const togglePin = useCallback(
    async (id: string) => {
      const doc = documentsRef.current[id];
      if (!doc) return;
      try {
        const updated = await pinCanvasApi(id, !doc.pinned);
        upsertDocument(updated);
      } catch (err) {
        reportError(err, 'Unable to update pin');
      }
    },
    [reportError, upsertDocument]
  );

  const setMode = useCallback((id: string, mode: CanvasViewMode) => {
    setViewMode((prev) => ({ ...prev, [id]: mode }));
  }, []);

  const resolveConflict = useCallback(
    async (id: string, strategy: 'reload' | 'overwrite') => {
      const conflict = conflicts[id];
      if (!conflict) return;
      if (strategy === 'reload') {
        upsertDocument(conflict);
        setDrafts((prev) => ({ ...prev, [id]: conflict.content }));
        setTitles((prev) => ({ ...prev, [id]: conflict.title }));
        setConflicts((prev) => ({ ...prev, [id]: null }));
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
        return;
      }
      try {
        const { updateCanvas } = await import('@/lib/canvas/api');
        const doc = await updateCanvas(id, {
          content: draftsRef.current[id],
          title: titlesRef.current[id],
          force: true,
        });
        upsertDocument(doc);
        setConflicts((prev) => ({ ...prev, [id]: null }));
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
      } catch (err) {
        reportError(err, 'Unable to overwrite canvas');
      }
    },
    [conflicts, reportError, upsertDocument]
  );

  const runAiEdit = useCallback(
    async (
      id: string,
      action: CanvasAiAction,
      opts: {
        start?: number;
        end?: number;
        selectedText?: string;
        wholeDocument?: boolean;
        instruction?: string;
        targetLanguage?: string;
      }
    ) => {
      const doc = documentsRef.current[id];
      if (!doc) return null;
      // Persist latest draft before AI mutates server content.
      await flushAutosave(id);
      setIsAiBusy(true);
      try {
        const latest = documentsRef.current[id] ?? doc;
        const result = await aiEditCanvas(id, {
          action,
          ...opts,
          expectedRevision: latest.revision,
        });
        upsertDocument(result.canvas);
        setDrafts((prev) => ({ ...prev, [id]: result.canvas.content }));
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
        return result;
      } catch (err) {
        reportError(err, 'AI edit failed');
        return null;
      } finally {
        setIsAiBusy(false);
      }
    },
    [flushAutosave, reportError, upsertDocument]
  );

  const loadVersions = useCallback(
    async (id: string) => {
      try {
        const result = await listCanvasVersions(id);
        setVersions(result.items);
        return result.items;
      } catch (err) {
        reportError(err, 'Unable to load version history');
        return [];
      }
    },
    [reportError]
  );

  const restoreVersion = useCallback(
    async (id: string, versionId: string) => {
      try {
        const doc = await restoreCanvasVersion(id, versionId);
        upsertDocument(doc);
        setDrafts((prev) => ({ ...prev, [id]: doc.content }));
        setTitles((prev) => ({ ...prev, [id]: doc.title }));
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
        await loadVersions(id);
      } catch (err) {
        reportError(err, 'Unable to restore version');
      }
    },
    [loadVersions, reportError, upsertDocument]
  );

  const loadDiffAgainstVersion = useCallback(
    async (id: string, versionId: string) => {
      try {
        const version = await getCanvasVersion(id, versionId);
        setDiffBaseline(version.content ?? '');
        setMode(id, 'diff');
      } catch (err) {
        reportError(err, 'Unable to load diff');
      }
    },
    [reportError, setMode]
  );

  const activeDocument = useMemo(
    () => (activeId ? documents[activeId] ?? null : null),
    [activeId, documents]
  );

  const openTabs = useMemo(
    () => openIds.map((id) => documents[id]).filter(Boolean) as CanvasDocument[],
    [openIds, documents]
  );

  const clampWidth = useCallback((width: number) => {
    if (typeof window === 'undefined') return width;
    const max = Math.floor(window.innerWidth * MAX_WIDTH_RATIO);
    return Math.min(Math.max(width, MIN_WIDTH), Math.max(max, MIN_WIDTH));
  }, []);

  return {
    isOpen,
    setIsOpen,
    closePanel: () => {
      setIsOpen(false);
      setIsFullscreen(false);
      setMobileSurface('chat');
    },
    isFullscreen,
    setIsFullscreen,
    panelWidth,
    setPanelWidth: (w: number) => setPanelWidth(clampWidth(w)),
    clampWidth,
    mobileSurface,
    setMobileSurface,
    openTabs,
    activeId,
    setActiveId,
    activeDocument,
    drafts,
    titles,
    saveStatus,
    viewMode,
    conflicts,
    versions,
    diffBaseline,
    setDiffBaseline,
    isAiBusy,
    resetCanvasState,
    openDocument,
    createAndOpen,
    openFromArtifact,
    handleAssistantContent,
    closeTab,
    rename,
    duplicate,
    togglePin,
    setDraftContent,
    setDraftTitle,
    setMode,
    flushAutosave,
    resolveConflict,
    runAiEdit,
    loadVersions,
    restoreVersion,
    loadDiffAgainstVersion,
    showChatSurface: () => setMobileSurface('chat'),
    showCanvasSurface: () => {
      setIsOpen(true);
      setMobileSurface('canvas');
    },
  };
}
