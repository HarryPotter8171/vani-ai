'use client';

import React, { useState, memo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
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
          'my-6 overflow-hidden rounded-[20px] border border-white/[0.06]',
          'bg-[#161618] shadow-[0_8px_32px_rgba(0,0,0,0.18)]',
          'font-sans'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.05] bg-white/[0.025] px-5 py-3">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]/90" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]/90" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]/90" />
            </div>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/35">
              {match[1]}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'hover-lift flex items-center gap-1.5 rounded-full px-3.5 py-1.5',
              'text-[12px] font-medium',
              'bg-white/[0.05] text-white/50 hover:bg-white/[0.09] hover:text-white/80'
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

        <div className="custom-scrollbar overflow-x-auto px-5 py-5">
          <code
            className="block font-mono text-[13px] leading-[1.75] text-[#ebebf0]/90"
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
        'rounded-[8px] px-1.5 py-0.5 font-mono text-[13px] font-medium',
        'bg-primary/[0.07] text-primary dark:bg-primary/[0.12]'
      )}
      {...props}
    >
      {children}
    </code>
  );
};

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3.5 last:mb-0 leading-[1.8]">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-6 text-[1.625rem] font-semibold tracking-[-0.03em] first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2.5 mt-6 text-xl font-semibold tracking-[-0.02em] first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-5 text-[17px] font-semibold tracking-[-0.015em] first:mt-0">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3.5 ml-1 space-y-2 pl-5 list-disc marker:text-primary/70">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3.5 ml-1 space-y-2 pl-5 list-decimal marker:text-primary/70">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-[1.75] pl-0.5">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 border-l-2 border-primary/60 bg-accent-soft py-3 pl-4 pr-3 rounded-r-[16px] text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:opacity-75 transition-opacity duration-200">
      {children}
    </a>
  ),
  code: CodeBlock,
};

function MessageComponent({ role, content, isStreaming }: MessageProps) {
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'flex w-full px-1 md:px-2',
        isUser ? 'justify-end py-3' : 'justify-start py-4'
      )}
    >
      <div
        className={cn(
          'flex w-full max-w-[680px] gap-4',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* Assistant avatar */}
        {!isUser && (
          <div className="relative mt-2 shrink-0">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-[1.6]" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#007AFF] to-[#0056D6] text-white shadow-[0_4px_16px_rgba(0,122,255,0.3)]">
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
              'relative max-w-[85%] md:max-w-[75%]',
              'rounded-[24px] rounded-tr-[8px]',
              'bg-gradient-to-br from-[#007AFF] via-[#0066EE] to-[#0056D6]',
              'px-5 py-3.5 text-[15px] leading-[1.75] text-white/95',
              'shadow-[0_2px_8px_rgba(0,122,255,0.18),0_8px_32px_rgba(0,122,255,0.15)]',
              'ring-1 ring-white/10',
              'break-words whitespace-pre-wrap'
            )}
          >
            {content}
          </div>
        ) : (
          /* AI message card */
          <div
            className={cn(
              'ai-message-card min-w-0 flex-1',
              isStreaming && content && 'streaming-cursor'
            )}
          >
            <div className="prose-vani">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content || (isStreaming ? ' ' : '')}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(MessageComponent);
