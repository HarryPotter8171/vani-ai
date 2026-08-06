'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  memo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Mic, ArrowUp, Square, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import AttachmentPreview from '@/components/chat/AttachmentPreview';
import AttachmentLightbox from '@/components/chat/AttachmentLightbox';
import ComposerPlusMenu from '@/components/chat/ComposerPlusMenu';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { ACCEPT_ATTRIBUTE, IMAGE_ACCEPT_ATTRIBUTE } from '@/lib/files';
import type { MessageAttachment, PendingAttachment } from '@/lib/types';
import type { AgentTypeId, AgentTypeInfo } from '@/lib/agents';
import { CompactControlSkeleton } from '@/components/lazy/PanelSkeletons';

const AgentSelector = dynamic(() => import('@/components/agents/AgentSelector'), {
  ssr: false,
  loading: () => <CompactControlSkeleton />,
});

const ModelSelector = dynamic(() => import('@/components/models/ModelSelector'), {
  ssr: false,
  loading: () => <CompactControlSkeleton className="w-[7.5rem] max-md:w-[7.5rem]" />,
});

export interface ChatInputHandle {
  ingestFiles: (files: FileList | File[], source?: 'drop' | 'upload' | 'paste') => void;
  focus: () => void;
}

export interface ChatInputProps {
  onSendMessage: (message: string, attachments?: MessageAttachment[]) => void;
  isLoading?: boolean;
  onStopGenerating?: () => void;
  onOpenVoiceMode?: () => void;
  /** Open / create a Canvas workspace from the + menu. */
  onOpenCanvas?: () => void;
  /** Reports the floating composer shell height so the chat pane can clear it. */
  onHeightChange?: (height: number) => void;
  /** Optional agent selector — omit to hide Agents control. */
  agents?: AgentTypeInfo[];
  selectedAgent?: AgentTypeId | null;
  onSelectAgent?: (id: AgentTypeId | null) => void;
  /** Web Search / Deep Research mode toggles. */
  webSearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  onToggleWebSearch?: (value: boolean) => void;
  onToggleDeepResearch?: (value: boolean) => void;
  /** Model orchestrator selector. */
  selectedModel?: string;
  onSelectModel?: (modelKey: string) => void;
  projectDefaultModel?: string | null;
  /** Optional AI Dock / productivity strip rendered above the composer. */
  dock?: React.ReactNode;
  /**
   * floating — overlays the bottom of the chat pane (default).
   * inline — sits in normal flow under the home greeting (no huge empty gap).
   */
  placement?: 'floating' | 'inline';
  /**
   * When provided, file drops show contextual actions instead of attaching
   * immediately. Caller receives the FileList and must handle ingestion.
   */
  onFilesDropped?: (files: FileList) => void;
}

const MAX_TEXTAREA_HEIGHT = 120;
const MIN_TEXTAREA_HEIGHT = 22;

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
  onSendMessage,
  isLoading,
  onStopGenerating,
  onOpenVoiceMode,
  onOpenCanvas,
  onHeightChange,
  agents,
  selectedAgent = null,
  onSelectAgent,
  webSearchEnabled = false,
  deepResearchEnabled = false,
  onToggleWebSearch,
  onToggleDeepResearch,
  selectedModel = 'auto',
  onSelectModel,
  projectDefaultModel = null,
  dock,
  placement = 'floating',
  onFilesDropped,
},
  ref
) {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const isDesktop = useIsDesktop();
  const { keyboardInset } = useVisualViewport();
  /** Only lift the composer for the soft keyboard on mobile. */
  const keyboardOffset = !isDesktop ? keyboardInset : 0;

  const {
    attachments,
    ingestFiles,
    removeAttachment,
    cancelAttachment,
    retryAttachment,
    reorderAttachments,
    takeReadyAttachments,
    isReading,
    hasReady,
  } = useFileUpload();

  useImperativeHandle(
    ref,
    () => ({
      ingestFiles: (files, source = 'drop') => {
        void ingestFiles(files, source);
      },
      focus: () => {
        textareaRef.current?.focus();
      },
    }),
    [ingestFiles]
  );

  const previewAttachment =
    previewId === null ? null : (attachments.find((a) => a.id === previewId) ?? null);

  const openPreview = useCallback((attachment: PendingAttachment) => {
    setPreviewId(attachment.id);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewId(null);
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeightChange) return;

    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();

    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const submit = () => {
    if (isLoading || isReading) return;
    if (!input.trim() && !hasReady) return;

    const ready = takeReadyAttachments();
    onSendMessage(input.trim(), ready.length ? ready : undefined);
    setInput('');
    setPreviewId(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
        textareaRef.current.focus();
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) {
      onStopGenerating?.();
      return;
    }
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files, 'paste');
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      if (onFilesDropped) {
        onFilesDropped(e.dataTransfer.files);
      } else {
        void ingestFiles(e.dataTransfer.files, 'drop');
      }
    }
  };

  const canSend = (input.trim().length > 0 || hasReady) && !isLoading && !isReading;

  const controlBtnClass = cn(
    'hover-lift flex shrink-0 items-center justify-center rounded-full',
    /* 44px touch targets on mobile */
    'h-10 w-10 max-md:h-11 max-md:w-11 md:h-8 md:w-8',
    'text-muted-foreground/70',
    'transition-all duration-normal ease-out',
    'hover:bg-surface-hover hover:text-foreground',
    'disabled:cursor-not-allowed disabled:opacity-40',
    'touch-manipulation'
  );

  const enableWebSearch = (v: boolean) => {
    onToggleWebSearch?.(v);
    if (v) onSelectAgent?.(null);
  };

  const enableDeepResearch = (v: boolean) => {
    onToggleDeepResearch?.(v);
    if (v) onSelectAgent?.(null);
  };

  const hasExtra =
    attachments.length > 0 || webSearchEnabled || deepResearchEnabled;

  const isInline = placement === 'inline';

  return (
    <>
      <div
        ref={rootRef}
        data-testid="chat-composer"
        style={
          keyboardOffset > 0
            ? {
                bottom: keyboardOffset,
                transform: 'translateZ(0)',
                paddingBottom: '0.5rem',
              }
            : undefined
        }
        className={cn(
          isInline
            ? cn(
                // Desktop empty-home: inline under the hero (unchanged).
                'relative z-10 mx-auto mt-10 w-full max-w-[800px] px-0',
                // Mobile: pin to the visual viewport like ChatGPT/Gemini —
                // absolute/inline inside h-screen was clipped by overflow:hidden.
                'max-md:pointer-events-none max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-[45]',
                'max-md:mx-0 max-md:mt-0 max-md:flex max-md:w-full max-md:max-w-none max-md:justify-center',
                'max-md:px-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
                'max-md:transition-[bottom] max-md:duration-150 max-md:ease-out'
              )
            : cn(
                // Desktop conversation: absolute within the chat column.
                'pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center',
                'pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))]',
                // Mobile: fixed to the visual viewport so 100vh chrome can't hide it.
                'max-md:fixed max-md:z-[45] max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
                'max-md:px-3',
                'max-md:transition-[bottom] max-md:duration-150 max-md:ease-out'
              )
        )}
      >
        {!isInline ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/75 to-transparent" />
        ) : null}

        <div
          className={cn(
            'relative w-full',
            isInline
              ? 'pointer-events-auto max-w-none max-md:w-full'
              : 'pointer-events-auto vani-chat-column'
          )}
        >
          {!isInline ? dock : null}
          <form
            onSubmit={handleSubmit}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              'vani-composer relative flex w-full flex-col',
              'rounded-full',
              'bg-surface-input',
              'backdrop-blur-[var(--blur-glass)] backdrop-saturate-[1.8]',
              'border border-border/70',
              'shadow-[0_2px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]',
              'dark:shadow-[0_4px_20px_rgba(0,0,0,0.28),0_1px_3px_rgba(0,0,0,0.18)]',
              'transition-[background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
              hasExtra && 'rounded-[28px]',
              isDragging && 'border-accent/45 bg-accent-muted shadow-focus'
            )}
          >
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  key="drag-overlay"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={cn(
                    'pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5',
                    'rounded-[inherit]',
                    'dnd-overlay backdrop-blur-[4px]'
                  )}
                >
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full',
                      'bg-accent text-text-on-accent shadow-2'
                    )}
                  >
                    <Upload size={18} strokeWidth={2.25} />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-sm font-semibold tracking-[-0.015em] text-accent">
                      Drop to attach
                    </p>
                    <p className="mt-0.5 text-micro text-text-secondary">
                      Images, PDFs, docs & more
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              data-testid="chat-file-input"
              onChange={(e) => {
                if (e.target.files?.length) void ingestFiles(e.target.files, 'upload');
                e.target.value = '';
              }}
 />
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept={IMAGE_ACCEPT_ATTRIBUTE}
              className="hidden"
              data-testid="chat-image-input"
              onChange={(e) => {
                if (e.target.files?.length) void ingestFiles(e.target.files, 'upload');
                e.target.value = '';
              }}
 />
            <input
              ref={cameraInputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTRIBUTE}
              capture="environment"
              className="hidden"
              data-testid="chat-camera-input"
              onChange={(e) => {
                if (e.target.files?.length) void ingestFiles(e.target.files, 'camera');
                e.target.value = '';
              }}
 />

            {attachments.length > 0 && (
              <div className="px-3 pt-2.5">
                <AttachmentPreview
                  attachments={attachments}
                  onRemove={removeAttachment}
                  onCancel={cancelAttachment}
                  onRetry={retryAttachment}
                  onPreview={openPreview}
                  onReorder={reorderAttachments}
 />
              </div>
            )}

            <AnimatePresence>
              {(webSearchEnabled || deepResearchEnabled) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-1.5 overflow-hidden px-3.5 pt-2"
                >
                  {deepResearchEnabled && (
                    <ActiveModeChip
                      label="Deep Research"
                      onClear={() => enableDeepResearch(false)}
 />
                  )}
                  {webSearchEnabled && (
                    <ActiveModeChip
                      label="Web Search"
                      onClear={() => enableWebSearch(false)}
 />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Single lightweight row ≈ 56–60px */}
            <div
              className={cn(
                'flex w-full items-center gap-1 px-2.5',
                hasExtra ? 'min-h-[56px] py-2' : 'h-[56px]'
              )}
            >
              <ComposerPlusMenu
                disabled={isLoading}
                webSearchEnabled={webSearchEnabled}
                deepResearchEnabled={deepResearchEnabled}
                onUpload={() => fileInputRef.current?.click()}
                onCamera={() => cameraInputRef.current?.click()}
                onImage={() => imageInputRef.current?.click()}
                onCanvas={onOpenCanvas}
                onToggleWebSearch={onToggleWebSearch ? enableWebSearch : undefined}
                onToggleDeepResearch={onToggleDeepResearch ? enableDeepResearch : undefined}
 />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Message VANI…"
                disabled={isLoading}
                rows={1}
                aria-label="Message input"
                className={cn(
                  'min-w-0 flex-1 resize-none bg-transparent',
                  'py-2.5 text-chat leading-[1.5] tracking-[-0.014em]',
                  'text-foreground',
                  'placeholder:text-muted-foreground/38',
                  /* Focus ring lives on the form shell (focus-within + --focus-ring) */
                  'outline-none border-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'custom-scrollbar overflow-y-auto transition-[height] duration-150 ease-out'
                )}
                style={{ height: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT }}
 />

              <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
                {agents && onSelectAgent && (
                  <AgentSelector
                    agents={agents}
                    selectedAgent={deepResearchEnabled ? null : selectedAgent}
                    onSelect={(id) => {
                      if (id) enableDeepResearch(false);
                      onSelectAgent(id);
                    }}
                    disabled={isLoading || deepResearchEnabled}
 />
                )}
                {onSelectModel && (
                  <ModelSelector
                    value={selectedModel}
                    onChange={onSelectModel}
                    disabled={isLoading}
                    projectDefault={projectDefaultModel}
 />
                )}

                <button
                  type="button"
                  onClick={onOpenVoiceMode}
                  disabled={isLoading || !onOpenVoiceMode}
                  className={cn(
                    controlBtnClass,
                    onOpenVoiceMode && !isLoading && 'hover:text-primary'
                  )}
                  aria-label="Start voice mode"
                  title="Live Mode"
                >
                  <Mic size={17} strokeWidth={1.75} />
                </button>

                <button
                  type="submit"
                  disabled={!canSend && !isLoading}
                  className={cn(
                    'hover-lift flex shrink-0 items-center justify-center rounded-full',
                    'h-10 w-10 max-md:h-11 max-md:w-11 md:h-8 md:w-8',
                    'transition-all duration-normal ease-apple',
                    'touch-manipulation',
                    canSend
                      ? 'bg-accent text-text-on-accent shadow-[0_1px_2px_var(--accent-muted),0_4px_14px_var(--accent-glow)] hover:bg-accent-hover'
                      : isLoading
                        ? 'bg-accent/85 text-text-on-accent'
                        : 'bg-surface-hover text-text-tertiary/40 cursor-not-allowed'
                  )}
                  aria-label={isLoading ? 'Stop generating' : 'Send message'}
                >
                  {isLoading ? (
                    <Square size={10} strokeWidth={2.5} fill="currentColor" />
                  ) : (
                    <ArrowUp size={16} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <AttachmentLightbox attachment={previewAttachment} onClose={closePreview} />
    </>
  );
});

function ActiveModeChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5',
        'text-caption font-medium tracking-[-0.01em]',
        'bg-primary/[0.1] text-primary',
        'transition-colors duration-normal ease-out hover:bg-primary/[0.16]'
      )}
      aria-label={`Disable ${label}`}
    >
      <span>{label}</span>
      <X size={11} strokeWidth={2} className="opacity-70" />
    </button>
  );
}

export default memo(ChatInput);
