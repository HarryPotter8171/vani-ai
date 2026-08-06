'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import MarkdownContent from '@/components/chat/MarkdownContent';
import { ErrorState } from '@/components/ui/ErrorState';
import { fetchSharedChat, type SharedChat, type SharedMessage } from '@/lib/share';

export default function SharedChatPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params);
  return <SharedChatBody key={shareId} shareId={shareId} />;
}

function SharedChatBody({ shareId }: { shareId: string }) {
  const [chat, setChat] = useState<SharedChat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchSharedChat(shareId)
      .then((data) => {
        setChat(data);
      })
      .catch((err) => {
        setError((err as Error).message || 'Unable to load this conversation.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [shareId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchSharedChat(shareId)
      .then((data) => {
        if (!cancelled) setChat(data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || 'Unable to load this conversation.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-black/[0.06] bg-background/80 backdrop-blur-xl dark:border-white/[0.08]">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-[10px]',
                'bg-gradient-to-br from-accent via-accent-hover to-[var(--accent-pressed)] text-text-on-accent',
                'shadow-[0_2px_10px_var(--accent-glow)] ring-1 ring-white/20'
              )}
            >
              <Sparkles size={12} strokeWidth={2} />
            </div>
            <span className="font-display text-sm font-semibold tracking-[-0.02em] text-foreground">VANI AI</span>
          </Link>

          <span className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-micro font-medium text-muted-foreground dark:bg-white/[0.06]">
            <Lock size={10} strokeWidth={2} />
            Read-only
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[760px] px-5 py-10 sm:px-8">
        {isLoading && <SkeletonState />}

        {!isLoading && error && (
          <div className="flex flex-col items-center py-16">
            <ErrorState
              title="Couldn't open shared chat"
              message={error}
              onRetry={load}
              retrying={isLoading}
            />
            <Link
              href="/"
              className="mt-1 text-sm font-medium text-accent transition-opacity hover:opacity-70"
            >
              Go to VANI AI →
            </Link>
          </div>
        )}

        {!isLoading && !error && chat && (
          <>
            <h1 className="type-title mb-1.5 text-foreground">{chat.title}</h1>
            <p className="mb-8 text-caption text-muted-foreground/60" suppressHydrationWarning>
              Shared from VANI AI
              {chat.updatedAt
                ? ` · ${new Date(chat.updatedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}`
                : ''}
            </p>

            <div className="space-y-7">
              {chat.messages.map((message, index) => (
                <SharedMessageBubble key={index} message={message} />
              ))}
            </div>

            <div
              className={cn(
                'mt-12 flex flex-col items-center gap-3 rounded-[20px] py-8 text-center',
                'border border-black/[0.06] bg-black/[0.02]',
                'dark:border-white/[0.08] dark:bg-white/[0.03]'
              )}
            >
              <p className="text-sm text-muted-foreground">
                Want to continue this conversation or start your own?
              </p>
              <Link
                href="/"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2',
                  'text-sm font-medium text-white transition hover:brightness-110'
                )}
              >
                Open VANI AI
                <ArrowUpRight size={13} strokeWidth={2} />
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function SharedMessageBubble({ message }: { message: SharedMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
      <span className="px-1 text-micro font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">
        {isUser ? 'You' : 'VANI'}
      </span>

      <div
        className={cn(
          'max-w-full rounded-[20px] px-4 py-3',
          isUser ? 'bg-primary text-white' : 'w-full bg-black/[0.03] text-foreground dark:bg-white/[0.04]'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-body leading-[1.6] tracking-[-0.015em]">{message.content}</p>
        ) : (
          <MarkdownContent content={message.content} />
        )}

        {message.attachments?.length ? (
          <div className={cn('mt-2 flex flex-wrap gap-1.5', isUser && 'justify-end')}>
            {message.attachments.map((attachment, index) => (
              <span
                key={index}
                className={cn(
                  'rounded-full px-2.5 py-1 text-micro',
                  isUser ? 'bg-white/15 text-white' : 'bg-black/[0.05] text-muted-foreground dark:bg-white/[0.07]'
                )}
              >
                📎 {attachment.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="space-y-7">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-16 animate-pulse rounded-full bg-surface-hover" />
          <div className="h-16 w-full animate-pulse rounded-[20px] bg-black/[0.04] dark:bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}
