'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Columns2,
  Copy,
  CopyPlus,
  Download,
  Eye,
  FileCode2,
  GitCompare,
  History,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  WrapText,
  X,
  AlignLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CANVAS_TYPE_LABELS,
  countLines,
  countWords,
  formatCanvasDocument,
  isPreviewableCanvasType,
  supportsCanvasSplit,
  type CanvasAiAction,
  type CanvasDocument,
  type CanvasExportFormat,
  type CanvasSaveStatus,
  type CanvasSelection,
  type CanvasVersionSummary,
  type CanvasViewMode,
} from '@/lib/canvas';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { Spinner } from '@/components/ui/Spinner';
import CanvasPreview from '@/components/canvas/CanvasPreview';
import CanvasDiffView from '@/components/canvas/CanvasDiffView';
import CanvasAiMenu from '@/components/canvas/CanvasAiMenu';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { EASE, SPRING } from '@/lib/motion';

const editorFallback = (
  <div className="flex h-full min-h-[200px] items-center justify-center">
    <Spinner size={18} />
  </div>
);

/** Editors mount only after Canvas opens (dynamic + parent Suspense). */
const CanvasCodeEditor = dynamic(
  () => import('@/components/canvas/CanvasCodeEditor'),
  { ssr: false, loading: () => editorFallback }
);

const CanvasRichTextEditor = dynamic(
  () => import('@/components/canvas/CanvasRichTextEditor'),
  { ssr: false, loading: () => editorFallback }
);

export interface CanvasPanelProps {
  tabs: CanvasDocument[];
  activeId: string | null;
  drafts: Record<string, string>;
  titles: Record<string, string>;
  saveStatus: Record<string, CanvasSaveStatus>;
  viewMode: Record<string, CanvasViewMode>;
  conflicts: Record<string, CanvasDocument | null>;
  versions: CanvasVersionSummary[];
  diffBaseline: string | null;
  isFullscreen: boolean;
  isAiBusy: boolean;
  panelWidth: number;
  className?: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDraftChange: (id: string, content: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onSetMode: (id: string, mode: CanvasViewMode) => void;
  onToggleFullscreen: () => void;
  onClosePanel: () => void;
  onShowChat?: () => void;
  onSave?: () => void | Promise<void>;
  onSaveAndReturn?: () => void | Promise<void>;
  onDiscardAndReturn?: () => void;
  isDirty?: boolean;
  onResolveConflict: (id: string, strategy: 'reload' | 'overwrite') => void;
  onAiEdit: (
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
  ) => void;
  onLoadVersions: (id: string) => void;
  onRestoreVersion: (id: string, versionId: string) => void;
  onLoadDiff: (id: string, versionId: string) => void;
  onResize: (width: number) => void;
}

function IconButton({
  onClick,
  label,
  active,
  disabled,
  children,
  className,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-[10px] transition-colors duration-150',
        'md:h-8 md:w-8 md:rounded-[8px]',
        'disabled:pointer-events-none disabled:opacity-35',
        'touch-manipulation',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]',
        className
      )}
    >
      {children}
    </button>
  );
}

function saveLabel(status: CanvasSaveStatus | undefined): string {
  switch (status) {
    case 'dirty':
      return 'Unsaved';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'conflict':
      return 'Conflict';
    case 'error':
      return 'Save failed';
    default:
      return '';
  }
}

export default function CanvasPanel({
  tabs,
  activeId,
  drafts,
  titles,
  saveStatus,
  viewMode,
  conflicts,
  versions,
  diffBaseline,
  isFullscreen,
  isAiBusy,
  panelWidth,
  className,
  onSelectTab,
  onCloseTab,
  onRename,
  onDuplicate,
  onTogglePin,
  onDraftChange,
  onTitleChange,
  onSetMode,
  onToggleFullscreen,
  onClosePanel,
  onShowChat: _onShowChat,
  onSave,
  onSaveAndReturn,
  onDiscardAndReturn,
  isDirty = false,
  onResolveConflict,
  onAiEdit,
  onLoadVersions,
  onRestoreVersion,
  onLoadDiff,
  onResize,
}: CanvasPanelProps) {
  const isDesktop = useIsDesktop();
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;
  const content = active ? drafts[active.id] ?? active.content : '';
  const title = active ? titles[active.id] ?? active.title : '';
  const mode = active ? viewMode[active.id] ?? 'edit' : 'edit';
  const status = active ? saveStatus[active.id] : undefined;
  const conflict = active ? conflicts[active.id] : null;

  const [selection, setSelection] = useState<CanvasSelection>({
    start: 0,
    end: 0,
    text: '',
  });
  const [wordWrap, setWordWrap] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [savingLeave, setSavingLeave] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onResizeRef = useRef(onResize);
  const swipeRef = useRef<{ y: number; active: boolean }>({ y: 0, active: false });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    if (historyOpen && active) onLoadVersions(active.id);
  }, [historyOpen, active, onLoadVersions]);

  // Mobile: never allow split — one page at a time (Edit | Preview | Diff).
  useEffect(() => {
    if (isDesktop || !active) return;
    if (mode === 'split') onSetMode(active.id, 'edit');
  }, [isDesktop, active, mode, onSetMode]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [menuOpen]);

  const requestLeave = useCallback(() => {
    setMenuOpen(false);
    setExportOpen(false);
    if (isDirty) {
      setLeaveOpen(true);
      return;
    }
    onClosePanel();
  }, [isDirty, onClosePanel]);

  // ESC closes Canvas on desktop (chat stays mounted underneath).
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (leaveOpen) {
        setLeaveOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      requestLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, requestLeave, leaveOpen]);

  const previewable = active ? isPreviewableCanvasType(active.type) : false;
  const splitEnabled = active ? supportsCanvasSplit(active.type) && isDesktop : false;

  const words = useMemo(() => countWords(content), [content]);
  const lines = useMemo(() => countLines(content), [content]);

  const onResizeStart = (event: React.MouseEvent) => {
    resizeRef.current = { startX: event.clientX, startWidth: panelWidth };
    const onMove = (moveEvent: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - moveEvent.clientX;
      onResizeRef.current(resizeRef.current.startWidth + delta);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleFormat = () => {
    if (!active) return;
    onDraftChange(
      active.id,
      formatCanvasDocument(active.type, content, active.language)
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const handleExport = async (format: CanvasExportFormat) => {
    if (!active) return;
    const { exportCanvas } = await import('@/lib/canvas/export');
    await exportCanvas({ ...active, title, content }, format);
    setExportOpen(false);
    setMenuOpen(false);
  };

  const handleSaveClick = async () => {
    setSavingLeave(true);
    try {
      await onSave?.();
    } finally {
      setSavingLeave(false);
    }
  };

  const handleDirtySave = async () => {
    setSavingLeave(true);
    try {
      await onSaveAndReturn?.();
      setLeaveOpen(false);
      onClosePanel();
    } finally {
      setSavingLeave(false);
    }
  };

  const handleDirtyDiscard = () => {
    onDiscardAndReturn?.();
    setLeaveOpen(false);
    onClosePanel();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (isDesktop) return;
    const t = e.touches[0];
    if (!t) return;
    const target = e.target as HTMLElement;
    if (!target.closest('[data-canvas-drag-handle]')) return;
    swipeRef.current = { y: t.clientY, active: true };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!swipeRef.current.active) return;
    const t = e.changedTouches[0];
    swipeRef.current.active = false;
    if (!t) return;
    // Swipe down on chrome closes Canvas (same as Back).
    if (t.clientY - swipeRef.current.y > 90) requestLeave();
  };

  if (!active) return null;

  const widthStyle =
    isFullscreen || !isDesktop ? undefined : { width: panelWidth };

  /** Mobile: Edit | Preview | Diff only. Desktop may include Split. */
  const modeButtons = (
    [
      { id: 'edit' as const, icon: Pencil, label: 'Edit', enabled: true },
      {
        id: 'preview' as const,
        icon: Eye,
        label: 'Preview',
        enabled: previewable || active.type === 'csv' || active.type === 'json',
      },
      {
        id: 'split' as const,
        icon: Columns2,
        label: 'Split',
        enabled: splitEnabled,
      },
      {
        id: 'diff' as const,
        icon: GitCompare,
        label: 'Diff',
        enabled: Boolean(diffBaseline),
      },
    ] as const
  ).filter((item) => (isDesktop ? item.id !== 'split' || item.enabled : item.id !== 'split'));

  const moreMenu = (
    <div
      ref={menuRef}
      className="relative"
    >
      <IconButton
        onClick={() => {
          setMenuOpen((v) => !v);
          setExportOpen(false);
        }}
        label="More"
        active={menuOpen}
        className={!isDesktop ? 'h-11 w-11' : undefined}
      >
        <MoreHorizontal size={isDesktop ? 14 : 20} />
      </IconButton>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            transition={SPRING.snappy}
            className={cn(
              'absolute right-0 z-40 min-w-[180px] overflow-hidden rounded-xl p-1',
              'border border-[var(--glass-border)] bg-[var(--glass-strong)] shadow-[var(--glass-shadow)] backdrop-blur-xl',
              isDesktop ? 'top-9' : 'top-12'
            )}
            role="menu"
            aria-label="Canvas actions"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDuplicate(active.id);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-surface-hover md:py-1.5"
            >
              <CopyPlus size={14} /> Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onTogglePin(active.id);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-surface-hover md:py-1.5"
            >
              {active.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              {active.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setHistoryOpen(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-surface-hover md:py-1.5"
            >
              <History size={14} /> Version history
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleCopy()}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-surface-hover md:py-1.5"
            >
              <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
            <div className="my-1 h-px bg-border-subtle" />
            {(['pdf', 'docx', 'markdown', 'html', 'txt'] as CanvasExportFormat[]).map(
              (fmt) => (
                <button
                  key={fmt}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleExport(fmt)}
                  className="flex w-full rounded-lg px-2.5 py-2.5 text-left text-sm capitalize hover:bg-surface-hover md:py-1.5"
                >
                  Export {fmt}
                </button>
              )
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const editorPane = (
    <div
      className={cn(
        'min-h-0 min-w-0',
        mode === 'split' && isDesktop ? 'w-1/2 border-r border-border' : 'w-full',
        mode === 'preview' || mode === 'diff' ? 'hidden' : 'flex flex-col'
      )}
    >
      {active.type === 'richtext' ? (
        <CanvasRichTextEditor
          value={content}
          onChange={(v) => onDraftChange(active.id, v)}
          onSelectionChange={setSelection}
        />
      ) : (
        <CanvasCodeEditor
          value={content}
          onChange={(v) => onDraftChange(active.id, v)}
          type={active.type}
          language={active.language}
          wordWrap={wordWrap}
          onSelectionChange={setSelection}
          findOpen={findOpen}
          onFindOpenChange={setFindOpen}
        />
      )}
    </div>
  );

  const previewPane =
    mode === 'preview' || (mode === 'split' && isDesktop) ? (
      <div
        className={cn(
          'min-h-0 min-w-0',
          mode === 'split' && isDesktop ? 'w-1/2' : 'w-full'
        )}
      >
        <CanvasPreview
          type={active.type}
          content={content}
          language={active.language}
          refreshKey={refreshKey}
          title={title}
          className="h-full"
        />
      </div>
    ) : null;

  const leaveDialog = (
    <AnimatePresence>
      {leaveOpen ? (
        <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 md:items-center">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="canvas-leave-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: EASE.smooth }}
            className="w-full max-w-sm rounded-[20px] border border-border bg-surface-elevated p-4 shadow-[var(--glass-shadow-lg)]"
          >
            <h2
              id="canvas-leave-title"
              className="text-body font-semibold tracking-[-0.02em]"
            >
              Unsaved changes
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Save before returning to chat, or discard your edits.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={savingLeave}
                onClick={() => void handleDirtySave()}
                className="flex min-h-12 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-text-on-accent disabled:opacity-40 touch-manipulation"
              >
                {savingLeave ? 'Saving…' : 'Save & Exit'}
              </button>
              <button
                type="button"
                onClick={handleDirtyDiscard}
                className="flex min-h-12 items-center justify-center rounded-full bg-danger-muted px-4 text-sm font-semibold text-danger touch-manipulation"
              >
                Discard Changes
              </button>
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="flex min-h-12 items-center justify-center rounded-full bg-surface-hover px-4 text-sm font-semibold text-foreground touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  const historyDrawer = (
    <AnimatePresence>
      {historyOpen ? (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          className={cn(
            'absolute inset-y-0 right-0 z-30 flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-strong)] backdrop-blur-xl',
            isDesktop ? 'w-64' : 'inset-x-0 w-full'
          )}
        >
          <div className="flex items-center justify-between border-b border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
            <span className="text-sm font-medium">Versions</span>
            <IconButton onClick={() => setHistoryOpen(false)} label="Close history">
              <X size={14} />
            </IconButton>
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
            {versions.length === 0 ? (
              <PremiumEmpty
                size="sm"
                icon={History}
                title="No versions yet"
                description="Saved revisions will appear here."
                className="px-2 py-6"
              />
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className="mb-1 rounded-xl px-2.5 py-2 hover:bg-surface-hover"
                >
                  <div className="text-sm font-medium">Rev {v.revision}</div>
                  <div className="text-micro text-muted-foreground">
                    {v.source}
                    {v.note ? ` · ${v.note}` : ''}
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      className="rounded-md bg-black/[0.04] px-2 py-0.5 text-micro dark:bg-white/[0.08]"
                      onClick={() => {
                        onLoadDiff(active.id, v.id);
                        setHistoryOpen(false);
                      }}
                    >
                      Diff
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-primary/15 px-2 py-0.5 text-micro text-primary"
                      onClick={() => onRestoreVersion(active.id, v.id)}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <motion.aside
      initial={
        isDesktop
          ? { opacity: 0, x: 48 }
          : { opacity: 0, y: '100%' }
      }
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={
        isDesktop
          ? { opacity: 0, x: 36 }
          : { opacity: 0, y: '40%' }
      }
      transition={
        isDesktop
          ? { duration: 0.28, ease: EASE.smooth }
          : SPRING.snappy
      }
      style={widthStyle}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="complementary"
      aria-label="Canvas"
      className={cn(
        'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden',
        'border-l border-[var(--glass-border-subtle)] bg-[var(--glass)] backdrop-blur-2xl',
        'shadow-[var(--glass-shadow-lg)]',
        // Mobile: always full-screen overlay — never a half-screen split with chat.
        !isDesktop && 'fixed inset-0 z-50 w-full border-l-0',
        isFullscreen && isDesktop && 'fixed inset-0 z-50 w-full border-l-0',
        className
      )}
    >
      {isDesktop && !isFullscreen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize canvas"
          onMouseDown={onResizeStart}
          className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize hover:bg-primary/30"
        />
      )}

      {/* ── Mobile top app bar: Back | Canvas | Save | More ── */}
      {!isDesktop ? (
        <div
          data-canvas-drag-handle
          className="flex items-center gap-0.5 border-b border-black/[0.05] px-1.5 pb-2 pt-12 dark:border-white/[0.06] md:pt-2"
        >
          <IconButton
            onClick={requestLeave}
            label="Back to chat"
            className="h-11 w-11 shrink-0"
          >
            <ArrowLeft size={20} />
          </IconButton>
          <div className="min-w-0 flex-1 px-1 text-center">
            <div className="text-body font-semibold tracking-[-0.02em]">Canvas</div>
            <div className="truncate text-micro text-muted-foreground">{title}</div>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveClick()}
            disabled={savingLeave}
            className={cn(
              'min-h-11 shrink-0 rounded-full px-3.5 text-sm font-semibold tracking-[-0.02em]',
              'text-accent active:scale-[0.98] transition-transform touch-manipulation',
              'disabled:opacity-40'
            )}
            aria-label="Save"
          >
            {savingLeave ? 'Saving…' : 'Save'}
          </button>
          {moreMenu}
        </div>
      ) : (
        <>
          {/* Desktop tabs + always-visible Back */}
          <div className="flex items-center gap-1 border-b border-black/[0.05] px-2 pt-2 dark:border-white/[0.06]">
            <IconButton onClick={requestLeave} label="Back to chat">
              <ArrowLeft size={15} />
            </IconButton>
            <div className="custom-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-2">
              {tabs.map((tab) => {
                const isActive = tab.id === active.id;
                const tabTitle = titles[tab.id] ?? tab.title;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className={cn(
                      'group flex max-w-[180px] items-center gap-1.5 rounded-t-xl px-3 py-1.5 text-sm',
                      isActive
                        ? 'bg-black/[0.04] text-foreground dark:bg-white/[0.08]'
                        : 'text-muted-foreground hover:bg-surface-hover'
                    )}
                  >
                    {tab.pinned && <Pin size={11} className="shrink-0 text-primary" />}
                    <span className="truncate">{tabTitle}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Close ${tabTitle}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }
                      }}
                      className="rounded p-0.5 opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
                    >
                      <X size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
            <IconButton onClick={requestLeave} label="Close canvas">
              <X size={15} />
            </IconButton>
          </div>

          <div className="flex flex-col gap-2 border-b border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              {editingTitle ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => onTitleChange(active.id, e.target.value)}
                  onBlur={() => {
                    setEditingTitle(false);
                    onRename(active.id, title.trim() || 'Untitled');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingTitle(false);
                  }}
                  className="min-w-0 flex-1 rounded-lg bg-transparent text-body font-semibold tracking-[-0.01em] focus-ring-token"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="min-w-0 flex-1 truncate text-left text-body font-semibold tracking-[-0.01em]"
                >
                  {title}
                </button>
              )}
              <span className="shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-micro text-muted-foreground dark:bg-white/[0.06]">
                {CANVAS_TYPE_LABELS[active.type]}
              </span>
              <span
                className={cn(
                  'shrink-0 text-micro',
                  status === 'conflict' || status === 'error'
                    ? 'text-rose-500'
                    : status === 'saving' || status === 'dirty'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                )}
              >
                {saveLabel(status)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <div className="inline-flex items-center rounded-full bg-surface-hover p-0.5">
                {modeButtons.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.enabled}
                    onClick={() => onSetMode(active.id, item.id)}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded-full px-2.5 text-micro font-medium',
                      mode === item.id
                        ? 'bg-surface text-foreground shadow-token-sm'
                        : 'text-muted-foreground',
                      !item.enabled && 'opacity-35'
                    )}
                  >
                    <item.icon size={12} />
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-0.5">
                <CanvasAiMenu
                  type={active.type}
                  hasSelection={Boolean(selection.text)}
                  busy={isAiBusy}
                  onAction={(action, opts) =>
                    onAiEdit(active.id, action, {
                      ...opts,
                      start: selection.start,
                      end: selection.end,
                      selectedText: selection.text,
                    })
                  }
                />
                <IconButton
                  onClick={() => setFindOpen((v) => !v)}
                  label="Find / Replace"
                  active={findOpen}
                >
                  <FileCode2 size={14} />
                </IconButton>
                <IconButton onClick={handleFormat} label="Format document">
                  <AlignLeft size={14} />
                </IconButton>
                <IconButton
                  onClick={() => setWordWrap((v) => !v)}
                  label="Word wrap"
                  active={wordWrap}
                >
                  <WrapText size={14} />
                </IconButton>
                <IconButton
                  onClick={() => setRefreshKey((k) => k + 1)}
                  label="Refresh preview"
                >
                  <RefreshCw size={14} />
                </IconButton>
                <IconButton onClick={() => void handleCopy()} label="Copy">
                  {copied ? (
                    <span className="text-micro font-medium text-primary">OK</span>
                  ) : (
                    <Copy size={14} />
                  )}
                </IconButton>
                <div className="relative">
                  <IconButton
                    onClick={() => setExportOpen((v) => !v)}
                    label="Export"
                    active={exportOpen}
                  >
                    <Download size={14} />
                  </IconButton>
                  {exportOpen && (
                    <div className="absolute right-0 top-8 z-40 w-36 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-strong)] p-1 shadow-[var(--glass-shadow)] backdrop-blur-xl">
                      {(
                        ['pdf', 'docx', 'markdown', 'html', 'txt'] as CanvasExportFormat[]
                      ).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => void handleExport(fmt)}
                          className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-sm capitalize hover:bg-surface-hover"
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <IconButton
                  onClick={() => setHistoryOpen((v) => !v)}
                  label="Version history"
                  active={historyOpen}
                >
                  <History size={14} />
                </IconButton>
                {moreMenu}
                <IconButton
                  onClick={onToggleFullscreen}
                  label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </IconButton>
              </div>
            </div>
          </div>
        </>
      )}

      {conflict && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="flex-1">This canvas changed elsewhere.</span>
          <button
            type="button"
            className="rounded-lg bg-black/5 px-2 py-1 dark:bg-white/10"
            onClick={() => onResolveConflict(active.id, 'reload')}
          >
            Reload
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-2 py-1 text-white"
            onClick={() => onResolveConflict(active.id, 'overwrite')}
          >
            Overwrite
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {editorPane}
        {previewPane}
        {mode === 'diff' && diffBaseline != null && (
          <div className="min-h-0 w-full">
            <CanvasDiffView before={diffBaseline} after={content} />
          </div>
        )}
        {historyDrawer}
      </div>

      {/* Mobile bottom toolbar — one mode at a time, no split */}
      {!isDesktop ? (
        <div className="border-t border-black/[0.05] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 dark:border-white/[0.06]">
          <div className="inline-flex w-full items-center justify-around rounded-full bg-surface-hover p-1">
            {modeButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                onClick={() => onSetMode(active.id, item.id)}
                className={cn(
                  'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium',
                  'touch-manipulation',
                  mode === item.id
                    ? 'bg-surface text-foreground shadow-token-sm'
                    : 'text-muted-foreground',
                  !item.enabled && 'opacity-35'
                )}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t border-black/[0.05] px-3 py-1.5 text-micro text-muted-foreground dark:border-white/[0.06]">
          <span>
            {words} words · {lines} lines
            {selection.text ? ` · ${selection.text.length} selected` : ''}
          </span>
          <span>Rev {active.revision}</span>
        </div>
      )}

      {leaveDialog}
    </motion.aside>
  );
}
