'use client';

import React, { memo, useMemo, useEffect, useState, useCallback, useDeferredValue } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, FileSpreadsheet, FileArchive, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import ArtifactCard from '@/components/artifacts/ArtifactCard';
import AttachmentLightbox from '@/components/chat/AttachmentLightbox';
import { markdownComponents, REMARK_PLUGINS } from '@/components/chat/MarkdownContent';
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

export interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  meta?: MessageMeta;
  usage?: MessageUsage;
  activeArtifactId?: string | null;
  onOpenArtifact?: (id: string) => void;
  onArtifactsDetected?: (messageId: string, artifacts: Artifact[]) => void;
  /** "Forget this" — removes matching long-term memories derived from this turn. */
  onForgetMemory?: (content: string) => void;
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
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-[#FF3B30] text-[10px] font-bold text-white">
        PDF
      </span>
    ) : attachment.kind === 'docx' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-xs bg-[#2B579A] text-[9px] font-bold text-white">
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
      <span className="truncate text-[12px] font-medium text-white/95">{attachment.name}</span>
    </button>
  );
}

function AssistantAvatar() {
  return (
    <div className="relative mt-1.5 shrink-0" aria-hidden>
      <VaniLogo size="xs" glow />
    </div>
  );
}

function MessageComponent({
  id,
  role,
  content,
  isStreaming,
  attachments,
  meta,
  usage,
  activeArtifactId,
  onOpenArtifact,
  onArtifactsDetected,
  onForgetMemory,
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

  return (
    <>
      <div
        className={cn(
          'flex w-full',
          isUser ? 'justify-end py-2.5' : 'justify-start py-3.5',
          !isStreaming && 'msg-enter'
        )}
      >
        <div
          className={cn(
            'flex max-w-full gap-3.5',
            isUser ? 'flex-row-reverse' : 'flex-row',
            isUser ? 'w-auto max-w-[min(100%,520px)]' : 'w-full max-w-[680px]'
          )}
        >
          {!isUser && <AssistantAvatar />}

          {isUser ? (
            <div className="group/user relative flex w-fit max-w-full flex-col items-end gap-2.5">
              {/* Images render edge-to-edge — outside the text bubble */}
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
                    'relative flex w-fit max-w-full flex-col gap-2',
                    'rounded-[22px] rounded-br-[6px]',
                    'bg-accent px-[18px] py-3 text-chat leading-[1.55] text-text-on-accent',
                    'shadow-token-sm',
                    'break-words'
                  )}
                >
                  {nonImageAttachments.length > 0 && (
                    <div className="flex w-fit flex-wrap gap-1.5">
                      {nonImageAttachments.map((att) => (
                        <UserAttachmentChip
                          key={att.id}
                          attachment={att}
                          onOpen={openAttachment}
 />
                      ))}
                    </div>
                  )}
                  {content ? <div className="whitespace-pre-wrap">{content}</div> : null}
                </div>
              )}

              {canForget && (
                <button
                  type="button"
                  onClick={() => onForgetMemory?.(content)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                    'text-[11px] font-medium tracking-[-0.01em]',
                    'text-text-tertiary hover:bg-surface-hover hover:text-foreground',
                    'opacity-0 transition-opacity duration-normal group-hover/user:opacity-100 focus-visible:opacity-100'
                  )}
                >
                  <Brain size={11} strokeWidth={1.75} />
                  Forget this
                </button>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 w-fit max-w-full flex-col gap-3">
              {imageAttachments.length > 0 && (
                <div className="flex w-fit max-w-full flex-col gap-2">
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
                    'min-w-0 w-fit max-w-full rounded-[22px] rounded-bl-[6px] px-[18px] py-3.5 md:px-5',
                    'bg-surface-secondary text-foreground',
                    'border border-border',
                    'shadow-token-sm',
                    isStreaming && content && 'streaming-cursor'
                  )}
                >
                  {nonImageAttachments.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {nonImageAttachments.map((att) => (
                        <span
                          key={att.id}
                          className="rounded-full bg-surface-hover px-2.5 py-1 text-[12px] text-text-secondary"
                        >
                          {att.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="prose-vani">
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
                          <ReactMarkdown key={i} remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
                            {segment.value}
                          </ReactMarkdown>
                        )
                      )
                    ) : (
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
                        {renderContent || (isStreaming ? ' ' : '')}
                      </ReactMarkdown>
                    )}
                  </div>
                  {!isStreaming ? <UsageFooter usage={usage} meta={meta} /> : null}
                </div>
              ) : hasOnlyImages && !isStreaming ? (
                <UsageFooter usage={usage} meta={meta} />
              ) : null}
            </div>
          )}
        </div>
      </div>

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
    prev.attachments === next.attachments &&
    prev.meta === next.meta &&
    prev.usage === next.usage &&
    prev.activeArtifactId === next.activeArtifactId &&
    prev.onOpenArtifact === next.onOpenArtifact &&
    prev.onArtifactsDetected === next.onArtifactsDetected &&
    prev.onForgetMemory === next.onForgetMemory
  );
}

export default memo(MessageComponent, messagePropsEqual);
