'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  X,
  WrapText,
  FileCode2,
  Eye,
  Code2,
  Columns2,
  Pencil,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  RefreshCw,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LANGUAGE_INFO,
  canPreview,
  defaultViewMode,
  getDownloadFilename,
  getMimeType,
  isHtmlPreviewLanguage,
  isMermaidPreviewLanguage,
  supportsSplitView,
  type Artifact,
  type ArtifactViewMode,
} from '@/lib/artifacts';
import { openArtifactInNewTab, type PreviewViewport } from '@/lib/artifactPreview';
import ArtifactPreview from '@/components/artifacts/ArtifactPreview';
import ArtifactEditor, { ArtifactCodeView } from '@/components/artifacts/ArtifactEditor';

interface ArtifactPanelProps {
  artifact: Artifact;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  /** Mobile: switch back to the chat column. */
  onShowChat?: () => void;
  className?: string;
}

function IconButton({
  onClick,
  label,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]'
      )}
    >
      {children}
    </button>
  );
}

function SegmentedControl({
  value,
  onChange,
  previewEnabled,
  splitEnabled,
}: {
  value: ArtifactViewMode;
  onChange: (mode: ArtifactViewMode) => void;
  previewEnabled: boolean;
  splitEnabled: boolean;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full p-0.5',
        'bg-surface-hover',
        'ring-1 ring-black/[0.04] dark:ring-white/[0.06]'
      )}
      role="tablist"
      aria-label="Artifact view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'preview'}
        disabled={!previewEnabled}
        onClick={() => onChange('preview')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors',
          value === 'preview'
            ? 'bg-white text-foreground shadow-sm dark:bg-white/[0.12]'
            : 'text-muted-foreground hover:text-foreground disabled:opacity-35'
        )}
      >
        <Eye size={12.5} strokeWidth={2.25} />
        Preview
      </button>
      {splitEnabled && (
        <button
          type="button"
          role="tab"
          aria-selected={value === 'split'}
          disabled={!previewEnabled}
          onClick={() => onChange('split')}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors',
            value === 'split'
              ? 'bg-white text-foreground shadow-sm dark:bg-white/[0.12]'
              : 'text-muted-foreground hover:text-foreground disabled:opacity-35'
          )}
        >
          <Columns2 size={12.5} strokeWidth={2.25} />
          Split
        </button>
      )}
      <button
        type="button"
        role="tab"
        aria-selected={value === 'code'}
        onClick={() => onChange('code')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors',
          value === 'code'
            ? 'bg-white text-foreground shadow-sm dark:bg-white/[0.12]'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Code2 size={12.5} strokeWidth={2.25} />
        Code
      </button>
    </div>
  );
}

function ViewportToggle({
  value,
  onChange,
}: {
  value: PreviewViewport;
  onChange: (v: PreviewViewport) => void;
}) {
  const options: { id: PreviewViewport; label: string; icon: React.ReactNode }[] = [
    { id: 'desktop', label: 'Desktop', icon: <Monitor size={13.5} strokeWidth={2} /> },
    { id: 'tablet', label: 'Tablet', icon: <Tablet size={13.5} strokeWidth={2} /> },
    { id: 'mobile', label: 'Mobile', icon: <Smartphone size={13.5} strokeWidth={2} /> },
  ];

  return (
    <div
      className="inline-flex items-center rounded-[8px] bg-surface-hover p-0.5"
      role="group"
      aria-label="Preview viewport"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-label={opt.label}
          title={opt.label}
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-[6px] transition-colors',
            value === opt.id
              ? 'bg-white text-foreground shadow-sm dark:bg-white/[0.12]'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

/** Remounts when `artifact.id` changes so edit/view state resets cleanly. */
export default function ArtifactPanel(props: ArtifactPanelProps) {
  return <ArtifactPanelInner key={props.artifact.id} {...props} />;
}

function ArtifactPanelInner({
  artifact,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  onShowChat,
  className,
}: ArtifactPanelProps) {
  const previewEnabled = canPreview(artifact.language);
  const htmlLive = isHtmlPreviewLanguage(artifact.language);
  const mermaidLive = isMermaidPreviewLanguage(artifact.language);
  const splitLive = supportsSplitView(artifact.language);
  const [viewMode, setViewMode] = useState<ArtifactViewMode>(() => defaultViewMode(artifact.language));
  const [isEditing, setIsEditing] = useState(false);
  const [draftState, setDraftState] = useState({
    baseline: artifact.content,
    draft: artifact.content,
    dirty: false,
  });
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);

  // While streaming (or when the source updates and the user hasn't edited),
  // keep the draft in sync with the live artifact content.
  if (!draftState.dirty && draftState.baseline !== artifact.content) {
    setDraftState({
      baseline: artifact.content,
      draft: artifact.content,
      dirty: false,
    });
  }

  const draft = draftState.draft;
  const isDirty = draftState.dirty;

  // Clamp invalid modes without an effect.
  const effectiveViewMode: ArtifactViewMode = !previewEnabled
    ? 'code'
    : viewMode === 'split' && !splitLive
      ? 'preview'
      : viewMode;

  const info = LANGUAGE_INFO[artifact.language];
  const lineCount = draft.split('\n').length;
  const showPreviewChrome =
    htmlLive && (effectiveViewMode === 'preview' || effectiveViewMode === 'split');

  const displayContent = useMemo(() => draft, [draft]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([displayContent], {
      type: `${getMimeType(artifact)};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getDownloadFilename(artifact);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenInNewTab = () => {
    openArtifactInNewTab(artifact.language, displayContent, artifact.title);
  };

  const handleDraftChange = (value: string) => {
    setDraftState({
      baseline: artifact.content,
      draft: value,
      dirty: value !== artifact.content,
    });
  };

  const handleReset = () => {
    setDraftState({
      baseline: artifact.content,
      draft: artifact.content,
      dirty: false,
    });
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    setIsEditing(true);
    // Prefer split so edits stay live next to the preview.
    if (splitLive && previewEnabled) {
      setViewMode('split');
    } else {
      setViewMode('code');
    }
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const renderCodePane = () =>
    isEditing ? (
      <ArtifactEditor
        language={artifact.language}
        value={draft}
        onChange={handleDraftChange}
        wordWrap={wordWrap}
        editable
 />
    ) : (
      <ArtifactCodeView
        language={artifact.language}
        content={displayContent}
        isStreaming={artifact.isStreaming}
        wordWrap={wordWrap}
 />
    );

  const renderPreviewPane = () => (
    <ArtifactPreview
      language={artifact.language}
      content={displayContent}
      title={artifact.title}
      viewport={htmlLive ? viewport : 'desktop'}
      refreshKey={refreshKey}
 />
  );

  return (
    <motion.div
      key="artifact-panel"
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'relative z-30 h-full shrink-0 flex-col overflow-hidden',
        'border-l border-border',
        'bg-white/75 dark:bg-[#0b0b0c]/95 backdrop-blur-2xl',
        !isFullscreen && 'w-full md:w-[480px] lg:w-[520px]',
        isFullscreen && 'fixed inset-0 z-50 w-full border-l-0',
        effectiveViewMode === 'split' && !isFullscreen && 'md:w-[640px] lg:w-[720px]',
        className ?? 'flex'
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-black/[0.06] px-3.5 py-3 dark:border-white/[0.07]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {onShowChat && (
              <span className="md:hidden">
                <IconButton label="Back to chat" onClick={onShowChat}>
                  <MessageSquare size={14.5} strokeWidth={2} />
                </IconButton>
              </span>
            )}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary dark:bg-primary/15">
              <FileCode2 size={14} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-foreground">
                {artifact.title}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {info.label}
                {artifact.isStreaming ? ' · Generating…' : ` · ${lineCount} lines`}
                {isDirty ? ' · Edited' : ''}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onToggleFullscreen}>
              {isFullscreen ? <Minimize2 size={14.5} strokeWidth={2} /> : <Maximize2 size={14.5} strokeWidth={2} />}
            </IconButton>
            <IconButton label="Close artifact" onClick={onClose}>
              <X size={15} strokeWidth={2} />
            </IconButton>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <SegmentedControl
            value={effectiveViewMode}
            onChange={(mode) => {
              setViewMode(mode);
              if (mode === 'preview') setIsEditing(false);
              if (mode === 'split') setIsEditing(true);
            }}
            previewEnabled={previewEnabled}
            splitEnabled={splitLive}
 />

          <div className="flex items-center gap-0.5">
            {showPreviewChrome && (
              <>
                <ViewportToggle value={viewport} onChange={setViewport} />
                <IconButton label="Refresh preview" onClick={handleRefresh}>
                  <RefreshCw size={13.5} strokeWidth={2} />
                </IconButton>
              </>
            )}
            {isDirty && (
              <IconButton label="Reset edits" onClick={handleReset}>
                <RotateCcw size={14} strokeWidth={2} />
              </IconButton>
            )}
            <IconButton
              label={isEditing ? 'Exit edit mode' : 'Edit'}
              active={isEditing}
              disabled={artifact.isStreaming}
              onClick={handleToggleEdit}
            >
              <Pencil size={13.5} strokeWidth={2} />
            </IconButton>
            <IconButton
              label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              active={wordWrap}
              onClick={() => setWordWrap((v) => !v)}
            >
              <WrapText size={14.5} strokeWidth={2} />
            </IconButton>
            <IconButton
              label={
                copied
                  ? 'Copied'
                  : mermaidLive
                    ? 'Copy Mermaid'
                    : artifact.language === 'html'
                      ? 'Copy HTML'
                      : 'Copy'
              }
              onClick={handleCopy}
            >
              {copied ? (
                <Check size={14.5} strokeWidth={2.25} className="text-emerald-500" />
              ) : (
                <Copy size={14.5} strokeWidth={2} />
              )}
            </IconButton>
            <IconButton
              label={
                mermaidLive
                  ? 'Download Mermaid'
                  : artifact.language === 'html'
                    ? 'Download HTML'
                    : 'Download'
              }
              onClick={handleDownload}
            >
              <Download size={14.5} strokeWidth={2} />
            </IconButton>
            <IconButton label="Open preview in new tab" onClick={handleOpenInNewTab}>
              <ExternalLink size={14} strokeWidth={2} />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {effectiveViewMode === 'split' && previewEnabled && splitLive ? (
            <motion.div
              key="split"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute inset-0 flex min-h-0 flex-col md:flex-row"
            >
              <div className="min-h-0 flex-1 overflow-hidden border-b border-black/[0.06] bg-[#1e1e1e] dark:border-white/[0.07] md:border-b-0 md:border-r">
                {renderCodePane()}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{renderPreviewPane()}</div>
            </motion.div>
          ) : effectiveViewMode === 'preview' && previewEnabled ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute inset-0"
            >
              {renderPreviewPane()}
            </motion.div>
          ) : (
            <motion.div
              key={isEditing ? 'edit' : 'code'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute inset-0 bg-[#1e1e1e]"
            >
              {renderCodePane()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
