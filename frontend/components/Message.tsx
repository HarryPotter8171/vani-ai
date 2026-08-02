'use client';

import React, { useState, useMemo, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, FileText, FileSpreadsheet, FileArchive } from 'lucide-react';
import { cn } from '@/lib/utils';
import ArtifactCard from '@/components/artifacts/ArtifactCard';
import { extractArtifacts, type Artifact } from '@/lib/artifacts';
import type { MessageAttachment } from '@/lib/types';

export interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  activeArtifactId?: string | null;
  onOpenArtifact?: (id: string) => void;
  onArtifactsDetected?: (messageId: string, artifacts: Artifact[]) => void;
}

function UserAttachmentChip({ attachment }: { attachment: MessageAttachment }) {
  if (attachment.kind === 'image' && attachment.previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachment.previewUrl}
        alt={attachment.name}
        className="max-h-[220px] max-w-[min(100%,280px)] rounded-[14px] object-cover ring-1 ring-white/25"
      />
    );
  }

  const icon =
    attachment.kind === 'pdf' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FF3B30] text-[10px] font-bold text-white">
        PDF
      </span>
    ) : attachment.kind === 'docx' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#2B579A] text-[9px] font-bold text-white">
        W
      </span>
    ) : attachment.kind === 'xlsx' || attachment.kind === 'csv' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#217346] text-white">
        <FileSpreadsheet size={14} strokeWidth={2} />
      </span>
    ) : attachment.kind === 'zip' ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FF9F0A] text-white">
        <FileArchive size={14} strokeWidth={2} />
      </span>
    ) : (
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/20 text-white">
        <FileText size={14} strokeWidth={2} />
      </span>
    );

  return (
    <div className="flex max-w-[180px] items-center gap-2 rounded-[12px] bg-white/15 px-2 py-1.5 ring-1 ring-white/20">
      {icon}
      <span className="truncate text-[12px] font-medium text-white/95">{attachment.name}</span>
    </div>
  );
}

const CodeBlock = ({
  inline,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div
        className={cn(
          'my-6 overflow-hidden rounded-[18px] border border-white/[0.06]',
          'bg-[#141416] shadow-[0_1px_1px_rgba(0,0,0,0.1),0_10px_32px_rgba(0,0,0,0.16)]',
          'font-sans'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.05] bg-white/[0.025] px-4 py-2.5">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]/90" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]/90" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]/90" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
              {match[1]}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'hover-lift flex items-center gap-1.5 rounded-full px-3 py-1.5',
              'text-[11.5px] font-medium',
              'bg-white/[0.06] text-white/55 hover:bg-white/[0.11] hover:text-white/90'
            )}
          >
            {copied ? (
              <>
                <Check size={12} strokeWidth={2.5} className="text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} strokeWidth={2} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="custom-scrollbar overflow-x-auto px-4 py-4">
          <code
            className="block font-mono text-[12.5px] leading-[1.7] text-[#ececf1]/92"
            {...props}
          >
            {children}
          </code>
        </div>
      </div>
    );
  }

  return (
    <code
      className={cn(
        'rounded-[7px] px-1.5 py-0.5 font-mono text-[12.5px] font-medium',
        'bg-primary/[0.08] text-primary dark:bg-primary/[0.14]'
      )}
      {...props}
    >
      {children}
    </code>
  );
};

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0 text-[15px] leading-[1.7] tracking-[-0.015em]">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-2.5 mt-5 text-[1.4rem] font-semibold tracking-[-0.03em] first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-5 text-[1.15rem] font-semibold tracking-[-0.022em] first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-4 text-[16px] font-semibold tracking-[-0.016em] first:mt-0">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 ml-1 space-y-1.5 pl-5 list-disc marker:text-primary/60">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 ml-1 space-y-1.5 pl-5 list-decimal marker:text-primary/60">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-[1.7] tracking-[-0.015em] pl-0.5">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-3.5 border-l-2 border-primary/50 bg-accent-soft py-2.5 pl-4 pr-3 rounded-r-[14px] text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:opacity-70 transition-opacity duration-150">
      {children}
    </a>
  ),
  code: CodeBlock,
};

function MessageComponent({
  id,
  role,
  content,
  isStreaming,
  attachments,
  activeArtifactId,
  onOpenArtifact,
  onArtifactsDetected,
}: MessageProps) {
  const isUser = role === 'user';
  const hasAttachments = !!attachments?.length;

  // Detect long code / HTML / etc. fenced blocks and split this message
  // into renderable segments (plain markdown text vs. artifact cards).
  // Memoized per-instance — recomputes only when this specific message's
  // own content changes, never when a sibling message updates.
  const { segments, artifacts } = useMemo(
    () => (isUser ? { segments: [], artifacts: [] } : extractArtifacts(content, id, !!isStreaming)),
    [isUser, content, id, isStreaming]
  );

  useEffect(() => {
    if (!isUser) onArtifactsDetected?.(id, artifacts);
  }, [isUser, id, artifacts, onArtifactsDetected]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'flex w-full px-3 md:px-4',
        isUser ? 'justify-end py-1.5' : 'justify-start py-6'
      )}
    >
      <div
        className={cn(
          'flex w-full max-w-[720px] gap-3.5',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* Assistant avatar */}
        {!isUser && (
          <div className="relative mt-2 shrink-0">
            <div className="absolute inset-0 rounded-full bg-primary/15 blur-xl scale-[1.4]" />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-[#0A84FF] to-[#0056D6] text-white shadow-[0_2px_10px_rgba(0,122,255,0.24)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
              </svg>
            </div>
          </div>
        )}

        {isUser ? (
          /* Refined user bubble */
          <div
            className={cn(
              'relative flex max-w-[85%] flex-col gap-2 md:max-w-[70%]',
              'rounded-[20px] rounded-tr-[6px]',
              'bg-gradient-to-br from-[#0A84FF] to-[#0066EE]',
              'px-4 py-2.5 text-[15px] leading-[1.55] text-white',
              'shadow-[0_1px_1px_rgba(0,122,255,0.12),0_3px_10px_rgba(0,122,255,0.13)]',
              'ring-1 ring-white/[0.06]',
              'break-words'
            )}
          >
            {hasAttachments && (
              <div className="flex flex-wrap gap-1.5">
                {attachments!.map((att) => (
                  <UserAttachmentChip key={att.id} attachment={att} />
                ))}
              </div>
            )}
            {content ? <div className="whitespace-pre-wrap">{content}</div> : null}
          </div>
        ) : (
          /* AI message — subtle glass, ChatGPT macOS style */
          <div
            className={cn(
              'min-w-0 w-fit max-w-full rounded-[20px] px-6 py-4',
              'bg-white/[0.16] dark:bg-white/[0.045]',
              'backdrop-blur-2xl backdrop-saturate-[1.8]',
              'border border-black/[0.035] dark:border-white/[0.05]',
              'shadow-[0_1px_1px_rgba(0,0,0,0.012),0_12px_28px_rgba(0,0,0,0.03)]',
              isStreaming && content && 'streaming-cursor'
            )}
          >
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
                    <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {segment.value}
                    </ReactMarkdown>
                  )
                )
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {content || (isStreaming ? ' ' : '')}
                </ReactMarkdown>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(MessageComponent);
