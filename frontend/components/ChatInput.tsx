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
import { ACCEPT_ATTRIBUTE, IMAGE_ACCEPT_ATTRIBUTE } from '@/lib/files';
import type { MessageAttachment, PendingAttachment } from '@/lib/types';
import type { AgentTypeId, AgentTypeInfo } from '@/lib/agents';

const AgentSelector = dynamic(() => import('@/components/agents/AgentSelector'), {
  ssr: false,
  loading: () => null,
});

const ModelSelector = dynamic(() => import('@/components/models/ModelSelector'), {
  ssr: false,
  loading: () => null,
});

export interface ChatInputHandle {
  ingestFiles: (files: FileList | File[], source?: 'drop' | 'upload' | 'paste') => void;
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
    'hover-lift flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
    'text-muted-foreground/70',
    'transition-all duration-normal ease-out',
    'hover:bg-surface-hover hover:text-foreground',
    'disabled:cursor-not-allowed disabled:opacity-40'
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

  return (
    <>
      <div
        ref={rootRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:px-6"
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/75 to-transparent" />

        <div className="pointer-events-auto relative w-full max-w-[760px]">
          {dock}
          <form
            onSubmit={handleSubmit}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              'relative flex w-full flex-col',
              hasExtra ? 'rounded-[28px]' : 'rounded-full',
              'bg-surface-input',
              'backdrop-blur-[var(--blur-glass)] backdrop-saturate-[1.8]',
              'border border-border',
              'shadow-2',
              'transition-[background-color,box-shadow,border-color,border-radius] duration-normal ease-apple',
              'focus-within:border-accent/35 focus-within:shadow-focus',
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
                    <p className="text-[13.5px] font-semibold tracking-[-0.015em] text-accent">
                      Drop to attach
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-text-secondary">
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

            {/* Single lightweight row ≈ 54px */}
            <div
              className={cn(
                'flex w-full items-center gap-0.5 px-1.5',
                hasExtra ? 'min-h-[52px] py-1.5' : 'h-[54px]'
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
                  'py-2 text-[15px] leading-[1.4] tracking-[-0.014em]',
                  'text-foreground',
                  'placeholder:text-muted-foreground/38',
                  'outline-none border-none ring-0 focus:ring-0 focus-visible:shadow-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'custom-scrollbar overflow-y-auto'
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
                  aria-label="Start Live Mode"
                  title="Live Mode"
                >
                  <Mic size={17} strokeWidth={1.75} />
                </button>

                <button
                  type="submit"
                  disabled={!canSend && !isLoading}
                  className={cn(
                    'hover-lift flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    'transition-all duration-normal ease-apple',
                    canSend
                      ? 'bg-accent text-text-on-accent shadow-[0_1px_2px_rgba(107,92,255,0.2),0_4px_14px_rgba(107,92,255,0.32)] hover:bg-accent-hover'
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
        'text-[12px] font-medium tracking-[-0.01em]',
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
