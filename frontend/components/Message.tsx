'use client';

import React, { memo, useMemo, useEffect, useState, useCallback, useDeferredValue } from 'react';
import { FileText, FileSpreadsheet, FileArchive, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import ArtifactCard from '@/components/artifacts/ArtifactCard';
import AttachmentLightbox from '@/components/chat/AttachmentLightbox';
import MessageActions from '@/components/chat/MessageActions';
import MessageActionSheet from '@/components/chat/MessageActionSheet';
import MarkdownContent from '@/components/chat/MarkdownContent';
import { extractArtifacts, type Artifact } from '@/lib/artifacts';
import { fileContentUrl } from '@/lib/upload';
import type {
  MessageAttachment,
  MessageMeta,
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
          'max-h-[420px] max-w-[min(100%,480px)]'
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
  attachments,
  meta,
  usage,
  activeArtifactId,
  onOpenArtifact,
  onArtifactsDetected,
  onForgetMemory,
  onRegenerate,
  onContinue,
  ttsState = 'idle',
  ttsParagraphIndex = -1,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
  regenerateDisabled,
}: MessageProps) {
  const isUser = role === 'user';
  const hasAttachments = !!attachments?.length;
  const imageAttachments =
    attachments?.filter((a) => a.kind === 'image' && resolvePreviewUrl(a)) ?? [];
  const nonImageAttachments =
    attachments?.filter((a) => !(a.kind === 'image' && resolvePreviewUrl(a))) ?? [];
  const hasOnlyImages =
    hasAttachments && imageAttachments.length > 0 && !content?.trim() && nonImageAttachments.length === 0;
  const canForget = isUser && !!content?.trim() && !!onForgetMemory && !isStreaming;
  const [lightboxAttachment, setLightboxAttachment] = useState<PendingAttachment | null>(null);

  const deferredContent = useDeferredValue(content);
  const renderContent = isStreaming ? deferredContent : content;

  const openAttachment = useCallback((attachment: MessageAttachment) => {
    setLightboxAttachment(toLightboxAttachment(attachment));
  }, []);

  const { segments, artifacts } = useMemo(
    () =>
      isUser
        ? { segments: [], artifacts: [] }
        : extractArtifacts(renderContent, id, !!isStreaming),
    [isUser, renderContent, id, isStreaming]
  );

  useEffect(() => {
    if (!isUser) onArtifactsDetected?.(id, artifacts);
  }, [isUser, id, artifacts, onArtifactsDetected]);

  const showActions = !isUser && !isStreaming && !!content?.trim();
  const showMeta = !isUser && !isStreaming && (!!usage || !!meta);
  const canContinue =
    !!wasInterrupted && !!onContinue && !isStreaming && !!content?.trim();
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const canLongPress = !isDesktop && !isStreaming && !!content?.trim();

  const openActionSheet = useCallback(() => {
    if (!canLongPress) return;
    setActionSheetOpen(true);
  }, [canLongPress]);

  const longPress = useLongPress({
    disabled: !canLongPress,
    onLongPress: openActionSheet,
  });

  const longPressHandlers = canLongPress ? longPress : {};

  return (
    <>
      <div
        className={cn(
          'flex w-full',
          /* User → Assistant 32px · Assistant → User 24px · tighter on mobile */
          isUser
            ? 'justify-end mb-6 max-md:mb-5 md:mb-8'
            : 'justify-start mb-5 max-md:mb-4 md:mb-6',
          !isStreaming && (isUser ? 'msg-enter-user' : 'msg-enter')
        )}
      >
        {isUser ? (
          <div
            className="group/user relative flex w-fit max-w-[85%] min-w-0 flex-col items-end gap-2 md:max-w-[65%]"
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

            {(content || nonImageAttachments.length > 0) && (
              <div
                className={cn(
                  'relative box-border flex w-fit max-w-full min-w-0 flex-col justify-center gap-2',
                  /* ChatGPT/Gemini-style bubble: soft corner toward the avatar side */
                  'rounded-[22px] rounded-br-[8px] px-4 py-3',
                  'max-md:px-[15px] max-md:py-3',
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
            )}

            {canForget && (
              <button
                type="button"
                onClick={() => onForgetMemory?.(content)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                  'text-micro font-medium tracking-[-0.01em]',
                  'text-text-tertiary hover:bg-surface-hover hover:text-foreground',
                  /* Always discoverable on touch; hover-reveal on desktop */
                  'max-md:opacity-70 md:opacity-0',
                  'transition-opacity duration-normal md:group-hover/user:opacity-100 focus-visible:opacity-100'
                )}
              >
                <Brain size={11} strokeWidth={1.75} />
                Forget this
              </button>
            )}
          </div>
        ) : (
          <div
            className="group/assistant flex w-full min-w-0 max-w-full items-start gap-2.5 overflow-visible max-md:gap-2.5 md:gap-3"
            {...longPressHandlers}
          >
            <div className="max-md:mt-1">
              <AssistantAvatar />
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-stretch">
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

              {(content || isStreaming || nonImageAttachments.length > 0) && !hasOnlyImages ? (
                <div
                  className={cn(
                    'min-w-0 w-full max-w-full overflow-visible',
                    'text-foreground',
                    /* Soft surface bubble on mobile — ChatGPT/Gemini rhythm */
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
                          />
                        )
                      )
                    ) : (
                      <MarkdownContent
                        content={renderContent || (isStreaming ? ' ' : '')}
                        highlightParagraph={
                          ttsState !== 'idle' ? ttsParagraphIndex : -1
                        }
                      />
                    )}
                  </div>
                </div>
              ) : null}

              {showMeta ? <UsageFooter usage={usage} meta={meta} /> : null}

              {/* Desktop: inline actions. Mobile: long-press action sheet + Continue chip. */}
              {showActions ? (
                <div className="max-md:hidden">
                  <MessageActions
                    content={content}
                    disabled={regenerateDisabled}
                    ttsState={ttsState}
                    onRegenerate={
                      onRegenerate ? () => onRegenerate(id) : undefined
                    }
                    onContinue={
                      canContinue ? () => onContinue?.(id) : undefined
                    }
                    onReadAloud={
                      onReadAloud
                        ? () => onReadAloud(id, content)
                        : undefined
                    }
                    onPauseAloud={onPauseAloud}
                    onStopAloud={onStopAloud}
                  />
                </div>
              ) : null}

              {canContinue ? (
                <div className="mt-2 md:hidden">
                  <button
                    type="button"
                    disabled={regenerateDisabled}
                    onClick={() => onContinue?.(id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3.5 py-2',
                      'text-sm font-medium tracking-[-0.02em]',
                      'bg-surface-secondary/90 text-foreground',
                      'ring-1 ring-border-subtle/70',
                      'active:scale-[0.98] transition-transform',
                      'disabled:pointer-events-none disabled:opacity-40'
                    )}
                  >
                    Continue generating
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <MessageActionSheet
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        content={content}
        role={role}
        disabled={regenerateDisabled}
        ttsState={ttsState}
        onRegenerate={
          onRegenerate && !isUser ? () => onRegenerate(id) : undefined
        }
        onContinue={
          canContinue && !isUser ? () => onContinue?.(id) : undefined
        }
        onReadAloud={
          onReadAloud && !isUser
            ? () => onReadAloud(id, content)
            : undefined
        }
        onPauseAloud={onPauseAloud}
        onStopAloud={onStopAloud}
      />

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
    prev.attachments === next.attachments &&
    prev.meta === next.meta &&
    prev.usage === next.usage &&
    prev.activeArtifactId === next.activeArtifactId &&
    prev.onOpenArtifact === next.onOpenArtifact &&
    prev.onArtifactsDetected === next.onArtifactsDetected &&
    prev.onForgetMemory === next.onForgetMemory &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onContinue === next.onContinue &&
    prev.ttsState === next.ttsState &&
    prev.ttsParagraphIndex === next.ttsParagraphIndex &&
    prev.onReadAloud === next.onReadAloud &&
    prev.onPauseAloud === next.onPauseAloud &&
    prev.onStopAloud === next.onStopAloud &&
    prev.regenerateDisabled === next.regenerateDisabled
  );
}

export default memo(MessageComponent, messagePropsEqual);
