'use client';

import React, {
  memo,
  useMemo,
  useEffect,
  useState,
  useCallback,
  useDeferredValue,
  useRef,
} from 'react';
import { FileText, FileSpreadsheet, FileArchive, Brain, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import ArtifactCard from '@/components/artifacts/ArtifactCard';
import AttachmentLightbox from '@/components/chat/AttachmentLightbox';
import MessageActions from '@/components/chat/MessageActions';
import MessageActionSheet from '@/components/chat/MessageActionSheet';
import MessageErrorCard from '@/components/chat/MessageErrorCard';
import MarkdownContent from '@/components/chat/MarkdownContent';
import { extractArtifacts, type Artifact } from '@/lib/artifacts';
import { fileContentUrl } from '@/lib/upload';
import type {
  MessageAttachment,
  MessageFeedback,
  MessageMeta,
  MessageStatus,
  MessageUsage,
  PendingAttachment,
} from '@/lib/types';
import UsageFooter from '@/components/models/UsageFooter';
import VaniLogo from '@/components/brand/VaniLogo';
import type { TtsState } from '@/components/chat/MessageActions';
import { useLongPress } from '@/hooks/useLongPress';
import { useIsDesktop } from '@/hooks/useMediaQuery';

export interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  wasInterrupted?: boolean;
  status?: MessageStatus;
  feedback?: MessageFeedback | null;
  pinned?: boolean;
  attachments?: MessageAttachment[];
  meta?: MessageMeta;
  usage?: MessageUsage;
  activeArtifactId?: string | null;
  onOpenArtifact?: (id: string) => void;
  onArtifactsDetected?: (messageId: string, artifacts: Artifact[]) => void;
  /** "Forget this" — removes matching long-term memories derived from this turn. */
  onForgetMemory?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onContinue?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  /** Edit & resend a user prompt (or jump to edit the preceding user turn). */
  onEditPrompt?: (messageId: string) => void;
  onEditAndResend?: (messageId: string, newContent: string) => void;
  onFeedback?: (messageId: string, value: MessageFeedback | null) => void;
  onOpenInCanvas?: (messageId: string, content: string) => void;
  onShareMessage?: (messageId: string, content: string) => void;
  onPinMessage?: (messageId: string) => void;
  onSaveResponse?: (messageId: string, content: string) => void;
  onExportMarkdown?: (messageId: string, content: string) => void;
  onExportPdf?: (messageId: string, content: string) => void;
  onDeleteResponse?: (messageId: string) => void;
  /** Latest assistant turn — keep action toolbar visible on desktop. */
  isLatestAssistant?: boolean;
  /** Imperatively open edit mode (e.g. Edit Prompt from a failed assistant turn). */
  forceEditing?: boolean;
  onForceEditingConsumed?: () => void;
  ttsState?: TtsState;
  ttsParagraphIndex?: number;
  onReadAloud?: (messageId: string, content: string) => void;
  onPauseAloud?: () => void;
  onStopAloud?: () => void;
  regenerateDisabled?: boolean;
}

function resolvePreviewUrl(attachment: MessageAttachment): string | undefined {
  if (attachment.previewUrl) return attachment.previewUrl;
  if (attachment.kind === 'image' && attachment.fileId) {
    return fileContentUrl(attachment.fileId);
  }
  return undefined;
}

function toLightboxAttachment(attachment: MessageAttachment): PendingAttachment {
  return {
    ...attachment,
    previewUrl: resolvePreviewUrl(attachment),
    status: 'ready',
    progress: 100,
  };
}

function ImageThumb({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group/img relative inline-block max-w-full overflow-hidden',
        'rounded-[16px]',
        'ring-1 ring-border-subtle',
        'transition-opacity duration-normal ease-out',
        'hover:opacity-95',
        'focus-visible:ring-2 focus-visible:ring-accent/40'
      )}
      aria-label={`View ${alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          'img-fade-in block h-auto w-auto max-w-full object-contain',
          'max-h-[min(420px,55vh)] max-w-[min(100%,480px)]',
          'max-md:max-h-[min(280px,45vh)] max-md:max-w-full'
        )}
      />
    </button>
  );
}

function UserAttachmentChip({
  attachment,
  onOpen,
}: {
  attachment: MessageAttachment;
  onOpen: (attachment: MessageAttachment) => void;
}) {
  const previewUrl = resolvePreviewUrl(attachment);

  if (attachment.kind === 'image' && previewUrl) {
    return (
      <ImageThumb
        src={previewUrl}
        alt={attachment.name}
        onOpen={() => onOpen(attachment)}
      />
    );
  }

  const icon =
    attachment.kind === 'pdf' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-[#FF3B30] text-micro font-bold text-white">
        PDF
      </span>
    ) : attachment.kind === 'docx' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-[#2B579A] text-micro font-bold text-white">
        W
      </span>
    ) : attachment.kind === 'xlsx' || attachment.kind === 'csv' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-[#217346] text-white">
        <FileSpreadsheet size={14} strokeWidth={2} />
      </span>
    ) : attachment.kind === 'zip' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-[#FF9F0A] text-white">
        <FileArchive size={14} strokeWidth={2} />
      </span>
    ) : (
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-white/20 text-white">
        <FileText size={14} strokeWidth={2} />
      </span>
    );

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      className="flex max-w-[180px] items-center gap-2 rounded-xs bg-white/15 px-2 py-1.5 ring-1 ring-white/20 transition-colors duration-fast hover:bg-white/22"
    >
      {icon}
      <span className="truncate text-caption font-medium text-white/95">{attachment.name}</span>
    </button>
  );
}

function AssistantAvatar() {
  return (
    <div className="mt-0.5 shrink-0" aria-hidden>
      <VaniLogo size="msg" glow />
    </div>
  );
}

function MessageComponent({
  id,
  role,
  content,
  isStreaming,
  wasInterrupted,
  status,
  feedback,
  pinned,
  attachments,
  meta,
  usage,
  activeArtifactId,
  onOpenArtifact,
  onArtifactsDetected,
  onForgetMemory,
  onRegenerate,
  onContinue,
  onRetry,
  onEditPrompt,
  onEditAndResend,
  onFeedback,
  onOpenInCanvas,
  onShareMessage,
  onPinMessage,
  onSaveResponse,
  onExportMarkdown,
  onExportPdf,
  onDeleteResponse,
  isLatestAssistant: _isLatestAssistant,
  forceEditing,
  onForceEditingConsumed,
  ttsState = 'idle',
  ttsParagraphIndex = -1,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
  regenerateDisabled,
}: MessageProps) {
  void _isLatestAssistant;
  const isUser = role === 'user';
  const isFailed = !isUser && status === 'error' && !isStreaming;
  const hasAttachments = !!attachments?.length;
  const imageAttachments =
    attachments?.filter((a) => a.kind === 'image' && resolvePreviewUrl(a)) ?? [];
  const nonImageAttachments =
    attachments?.filter((a) => !(a.kind === 'image' && resolvePreviewUrl(a))) ?? [];
  const hasOnlyImages =
    hasAttachments && imageAttachments.length > 0 && !content?.trim() && nonImageAttachments.length === 0;
  const canForget = isUser && !!content?.trim() && !!onForgetMemory && !isStreaming;
  const [lightboxAttachment, setLightboxAttachment] = useState<PendingAttachment | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const deferredContent = useDeferredValue(content);
  const renderContent = isStreaming ? deferredContent : content;

  const openAttachment = useCallback((attachment: MessageAttachment) => {
    setLightboxAttachment(toLightboxAttachment(attachment));
  }, []);

  const { segments, artifacts } = useMemo(
    () =>
      isUser || isFailed
        ? { segments: [], artifacts: [] }
        : extractArtifacts(renderContent, id, !!isStreaming),
    [isUser, isFailed, renderContent, id, isStreaming]
  );

  useEffect(() => {
    if (!isUser && !isFailed) onArtifactsDetected?.(id, artifacts);
  }, [isUser, isFailed, id, artifacts, onArtifactsDetected]);

  const showActions = !isUser && !isStreaming && !isFailed && !!content?.trim();
  const showMeta = !isUser && !isStreaming && !isFailed && (!!usage || !!meta);
  const canContinue =
    !!wasInterrupted && !!onContinue && !isStreaming && !isFailed && !!content?.trim();
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const isDesktop = useIsDesktop();
  // Long-press sheet is user-bubble only; assistant actions live in the always-on toolbar.
  const canLongPress =
    isUser && !isDesktop && !isStreaming && (!!content?.trim() || isFailed);

  const startEdit = useCallback(() => {
    setDraft(content);
    setEditing(true);
    window.setTimeout(() => editRef.current?.focus(), 30);
  }, [content]);

  useEffect(() => {
    if (!forceEditing || !isUser) return;
    startEdit();
    onForceEditingConsumed?.();
  }, [forceEditing, isUser, startEdit, onForceEditingConsumed]);

  const handleEditPromptAction = useCallback(() => {
    if (isUser && onEditAndResend) {
      startEdit();
      return;
    }
    onEditPrompt?.(id);
  }, [isUser, onEditAndResend, startEdit, onEditPrompt, id]);

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === content.trim()) {
      setEditing(false);
      return;
    }
    onEditAndResend?.(id, trimmed);
    setEditing(false);
  }, [draft, content, onEditAndResend, id]);

  const openActionSheet = useCallback(() => {
    if (!canLongPress) return;
    setActionSheetOpen(true);
  }, [canLongPress]);

  const longPress = useLongPress({
    disabled: !canLongPress || editing,
    onLongPress: openActionSheet,
  });

  const longPressHandlers = canLongPress && !editing ? longPress : {};

  return (
    <>
      <div
        className={cn(
          'flex w-full',
          /* User → Assistant spacing · tighter on mobile */
          isUser
            ? 'justify-end mb-5 max-md:mb-4 md:mb-7'
            : 'justify-start mb-4 max-md:mb-3.5 md:mb-5',
          !isStreaming && (isUser ? 'msg-enter-user' : 'msg-enter')
        )}
      >
        {isUser ? (
          <div
            className="group/user relative flex w-fit max-w-[85%] min-w-0 flex-col items-end gap-2 md:max-w-[70%]"
            {...longPressHandlers}
          >
            {imageAttachments.length > 0 && (
              <div className="flex w-fit max-w-full flex-col items-end gap-2">
                {imageAttachments.map((att) => (
                  <UserAttachmentChip
                    key={att.id}
                    attachment={att}
                    onOpen={openAttachment}
                  />
                ))}
              </div>
            )}

            {editing ? (
              <div className="flex w-full min-w-[min(100%,280px)] flex-col gap-2">
                <textarea
                  ref={editRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.min(8, Math.max(2, draft.split('\n').length))}
                  className={cn(
                    'w-full resize-none rounded-[18px] px-4 py-3',
                    'bg-surface-secondary text-body text-foreground',
                    'ring-1 ring-accent/40 outline-none',
                    'leading-[1.55] tracking-[-0.015em]',
                    'max-md:text-chat'
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditing(false);
                      setDraft(content);
                    }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      commitEdit();
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft(content);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm text-text-secondary hover:bg-surface-hover"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={regenerateDisabled || !draft.trim()}
                    onClick={commitEdit}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3.5 text-sm font-medium text-text-on-accent disabled:opacity-40"
                  >
                    <Check size={14} />
                    Save &amp; submit
                  </button>
                </div>
              </div>
            ) : (
              (content || nonImageAttachments.length > 0) && (
                <div
                  className={cn(
                    'relative box-border flex w-fit max-w-full min-w-0 flex-col justify-center gap-2',
                    'rounded-[22px] rounded-br-[8px] px-4 py-3',
                    'max-md:px-[15px] max-md:py-2.5',
                    'md:rounded-[20px] md:rounded-br-[20px] md:py-3.5',
                    'bg-accent text-body font-normal leading-[1.55] tracking-[-0.015em] text-text-on-accent',
                    'max-md:text-chat max-md:leading-[1.5]',
                    'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
                    'break-words [overflow-wrap:anywhere] whitespace-pre-wrap',
                    'select-text touch-manipulation',
                    canLongPress && 'max-md:active:opacity-[0.92]'
                  )}
                >
                  {nonImageAttachments.length > 0 && (
                    <div className="flex w-fit max-w-full flex-wrap gap-1.5">
                      {nonImageAttachments.map((att) => (
                        <UserAttachmentChip
                          key={att.id}
                          attachment={att}
                          onOpen={openAttachment}
                        />
                      ))}
                    </div>
                  )}
                  {content ? (
                    <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {content}
                    </div>
                  ) : null}
                </div>
              )
            )}

            {!editing && (canForget || onEditAndResend) ? (
              <div className="flex items-center gap-1">
                {onEditAndResend ? (
                  <button
                    type="button"
                    onClick={startEdit}
                    disabled={regenerateDisabled}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                      'text-micro font-medium tracking-[-0.01em]',
                      'text-text-tertiary hover:bg-surface-hover hover:text-foreground',
                      'max-md:opacity-70 md:opacity-0',
                      'transition-opacity duration-normal md:group-hover/user:opacity-100 focus-visible:opacity-100',
                      'disabled:pointer-events-none disabled:opacity-30'
                    )}
                  >
                    <Pencil size={11} strokeWidth={1.75} />
                    Edit
                  </button>
                ) : null}
                {canForget ? (
                  <button
                    type="button"
                    onClick={() => onForgetMemory?.(content)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                      'text-micro font-medium tracking-[-0.01em]',
                      'text-text-tertiary hover:bg-surface-hover hover:text-foreground',
                      'max-md:opacity-70 md:opacity-0',
                      'transition-opacity duration-normal md:group-hover/user:opacity-100 focus-visible:opacity-100'
                    )}
                  >
                    <Brain size={11} strokeWidth={1.75} />
                    Forget this
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="group/assistant flex w-full min-w-0 max-w-[85%] items-start gap-2.5 overflow-visible max-md:gap-2 md:max-w-full md:gap-3"
            {...longPressHandlers}
          >
            <div className="max-md:mt-1">
              <AssistantAvatar />
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-stretch">
              {isFailed ? (
                <div
                  className={cn(
                    'min-w-0 w-full max-w-full',
                    'max-md:rounded-[20px] max-md:rounded-tl-[8px]',
                    'max-md:bg-surface-secondary/80 max-md:px-3.5 max-md:py-3',
                    'max-md:ring-1 max-md:ring-border-subtle/60'
                  )}
                >
                  <MessageErrorCard
                    disabled={regenerateDisabled}
                    partialContent={content}
                    onRetry={
                      onRetry || onRegenerate
                        ? () => (onRetry || onRegenerate)?.(id)
                        : undefined
                    }
                    onEditPrompt={
                      onEditPrompt ? () => onEditPrompt(id) : undefined
                    }
                  />
                </div>
              ) : (
                <>
                  {imageAttachments.length > 0 && (
                    <div className="mb-3 flex w-fit max-w-full flex-col gap-2">
                      {imageAttachments.map((att) => {
                        const previewUrl = resolvePreviewUrl(att)!;
                        return (
                          <ImageThumb
                            key={att.id}
                            src={previewUrl}
                            alt={att.name}
                            onOpen={() => openAttachment(att)}
                          />
                        );
                      })}
                    </div>
                  )}

                  {(content || isStreaming || nonImageAttachments.length > 0) &&
                  !hasOnlyImages ? (
                    <div
                      className={cn(
                        'min-w-0 w-full max-w-full overflow-visible',
                        'text-foreground',
                        'max-md:rounded-[20px] max-md:rounded-tl-[8px]',
                        'max-md:bg-surface-secondary/80 max-md:px-3.5 max-md:py-3',
                        'max-md:ring-1 max-md:ring-border-subtle/60',
                        isStreaming && content && 'streaming-text streaming-cursor',
                        'select-text touch-manipulation'
                      )}
                    >
                      {nonImageAttachments.length > 0 ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {nonImageAttachments.map((att) => (
                            <span
                              key={att.id}
                              className="rounded-full bg-surface-hover px-2.5 py-1 text-caption font-medium text-text-secondary"
                            >
                              {att.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="prose-vani max-md:text-chat max-md:leading-[1.65]">
                        {segments.length > 0 ? (
                          segments.map((segment, i) =>
                            segment.type === 'artifact' ? (
                              <ArtifactCard
                                key={segment.artifact.id}
                                artifact={segment.artifact}
                                isActive={segment.artifact.id === activeArtifactId}
                                onOpen={onOpenArtifact ?? (() => {})}
                              />
                            ) : (
                              <MarkdownContent
                                key={`${id}-seg-${i}`}
                                content={segment.value}
                                lazy={!isStreaming && segment.value.length > 1200}
                              />
                            )
                          )
                        ) : (
                          <MarkdownContent
                            content={renderContent || (isStreaming ? ' ' : '')}
                            highlightParagraph={
                              ttsState !== 'idle' ? ttsParagraphIndex : -1
                            }
                            lazy={!isStreaming && (renderContent?.length || 0) > 1200}
                            streaming={!!isStreaming}
                          />
                        )}
                      </div>
                    </div>
                  ) : null}

                  {showMeta ? <UsageFooter usage={usage} meta={meta} /> : null}

                  {showActions ? (
                    <MessageActions
                      content={content}
                      disabled={regenerateDisabled}
                      ttsState={ttsState}
                      feedback={feedback}
                      pinned={!!pinned}
                      keepVisible
                      hoverReveal={false}
                      onRegenerate={
                        onRegenerate ? () => onRegenerate(id) : undefined
                      }
                      onContinue={
                        canContinue ? () => onContinue?.(id) : undefined
                      }
                      onEditPrompt={
                        onEditPrompt ? () => onEditPrompt(id) : undefined
                      }
                      onOpenCanvas={
                        onOpenInCanvas
                          ? () => onOpenInCanvas(id, content)
                          : undefined
                      }
                      onShare={
                        onShareMessage
                          ? () => onShareMessage(id, content)
                          : undefined
                      }
                      onPin={onPinMessage ? () => onPinMessage(id) : undefined}
                      onSave={
                        onSaveResponse
                          ? () => onSaveResponse(id, content)
                          : undefined
                      }
                      onExportMarkdown={
                        onExportMarkdown
                          ? () => onExportMarkdown(id, content)
                          : undefined
                      }
                      onExportPdf={
                        onExportPdf
                          ? () => onExportPdf(id, content)
                          : undefined
                      }
                      onDelete={
                        onDeleteResponse
                          ? () => onDeleteResponse(id)
                          : undefined
                      }
                      onFeedback={
                        onFeedback ? (v) => onFeedback(id, v) : undefined
                      }
                      onReadAloud={
                        onReadAloud
                          ? () => onReadAloud(id, content)
                          : undefined
                      }
                      onPauseAloud={onPauseAloud}
                      onStopAloud={onStopAloud}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {isUser ? (
        <MessageActionSheet
          open={actionSheetOpen}
          onClose={() => setActionSheetOpen(false)}
          content={content}
          role={role}
          disabled={regenerateDisabled}
          onEditPrompt={
            onEditAndResend ? handleEditPromptAction : undefined
          }
        />
      ) : null}

      <AttachmentLightbox
        attachment={lightboxAttachment}
        onClose={() => setLightboxAttachment(null)}
      />
    </>
  );
}

function messagePropsEqual(prev: MessageProps, next: MessageProps) {
  return (
    prev.id === next.id &&
    prev.role === next.role &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.wasInterrupted === next.wasInterrupted &&
    prev.status === next.status &&
    prev.feedback === next.feedback &&
    prev.pinned === next.pinned &&
    prev.isLatestAssistant === next.isLatestAssistant &&
    prev.attachments === next.attachments &&
    prev.meta === next.meta &&
    prev.usage === next.usage &&
    prev.activeArtifactId === next.activeArtifactId &&
    prev.onOpenArtifact === next.onOpenArtifact &&
    prev.onArtifactsDetected === next.onArtifactsDetected &&
    prev.onForgetMemory === next.onForgetMemory &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onContinue === next.onContinue &&
    prev.onRetry === next.onRetry &&
    prev.onEditPrompt === next.onEditPrompt &&
    prev.onEditAndResend === next.onEditAndResend &&
    prev.onFeedback === next.onFeedback &&
    prev.onOpenInCanvas === next.onOpenInCanvas &&
    prev.onShareMessage === next.onShareMessage &&
    prev.onPinMessage === next.onPinMessage &&
    prev.onSaveResponse === next.onSaveResponse &&
    prev.onExportMarkdown === next.onExportMarkdown &&
    prev.onExportPdf === next.onExportPdf &&
    prev.onDeleteResponse === next.onDeleteResponse &&
    prev.forceEditing === next.forceEditing &&
    prev.onForceEditingConsumed === next.onForceEditingConsumed &&
    prev.ttsState === next.ttsState &&
    prev.ttsParagraphIndex === next.ttsParagraphIndex &&
    prev.onReadAloud === next.onReadAloud &&
    prev.onPauseAloud === next.onPauseAloud &&
    prev.onStopAloud === next.onStopAloud &&
    prev.regenerateDisabled === next.regenerateDisabled
  );
}

export default memo(MessageComponent, messagePropsEqual);
