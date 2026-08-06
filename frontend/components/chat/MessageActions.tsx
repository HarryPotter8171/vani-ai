'use client';

import React, { memo, useCallback, useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TtsState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface MessageActionsProps {
  content: string;
  disabled?: boolean;
  ttsState?: TtsState;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onReadAloud?: () => void;
  onPauseAloud?: () => void;
  onStopAloud?: () => void;
}

function MessageActionsInner({
  content,
  disabled,
  ttsState = 'idle',
  onRegenerate,
  onContinue,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);

  const handleCopy = useCallback(async () => {
    const text = content.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [content]);

  const ttsActive =
    ttsState === 'playing' ||
    ttsState === 'paused' ||
    ttsState === 'loading' ||
    ttsState === 'error';

  const btn = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full',
    'h-8 w-8',
    'text-text-tertiary opacity-50',
    'transition-[opacity,color,transform] duration-150 ease-out',
    'hover:scale-110 hover:opacity-100 hover:text-foreground',
    'active:scale-95',
    'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
    'disabled:pointer-events-none disabled:opacity-30'
  );

  return (
    <div className="flex w-full max-w-full flex-col gap-2 pt-2">
      {onContinue ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onContinue}
          className={cn(
            'inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5',
            'text-sm font-medium tracking-[-0.02em]',
            'bg-surface-secondary/90 text-foreground',
            'ring-1 ring-border-subtle/70',
            'shadow-[0_0_20px_-10px_color-mix(in_srgb,var(--accent)_40%,transparent)]',
            'transition-[transform,background-color,box-shadow] duration-150',
            'hover:bg-surface-hover hover:ring-accent/30',
            'active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
            'disabled:pointer-events-none disabled:opacity-40'
          )}
        >
          <Play size={12} strokeWidth={2.25} className="text-accent" fill="currentColor" />
          Continue generating
        </button>
      ) : null}

      <div
        className="flex w-full max-w-full items-center gap-3"
        role="group"
        aria-label="Message actions"
      >
        <button
          type="button"
          className={cn(btn, liked === 'up' && 'text-accent opacity-100')}
          aria-label="Like"
          aria-pressed={liked === 'up'}
          disabled={disabled}
          onClick={() => setLiked((v) => (v === 'up' ? null : 'up'))}
        >
          <ThumbsUp size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={cn(btn, liked === 'down' && 'text-accent opacity-100')}
          aria-label="Dislike"
          aria-pressed={liked === 'down'}
          disabled={disabled}
          onClick={() => setLiked((v) => (v === 'down' ? null : 'down'))}
        >
          <ThumbsDown size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={cn(btn, copied && 'text-emerald-500 opacity-100')}
          aria-label={copied ? 'Copied' : 'Copy'}
          disabled={disabled || !content.trim()}
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check size={16} strokeWidth={2.25} />
          ) : (
            <Copy size={16} strokeWidth={1.75} />
          )}
        </button>
        {onRegenerate ? (
          <button
            type="button"
            className={btn}
            aria-label="Regenerate"
            disabled={disabled}
            onClick={onRegenerate}
          >
            <RotateCcw size={16} strokeWidth={1.75} />
          </button>
        ) : null}
        {onReadAloud ? (
          <button
            type="button"
            className={cn(
              btn,
              ttsActive && 'text-accent opacity-100',
              ttsState === 'error' && 'text-red-500 opacity-100'
            )}
            aria-label={
              ttsState === 'loading'
                ? 'Cancel speech'
                : ttsState === 'playing'
                  ? 'Pause reading'
                  : ttsState === 'paused'
                    ? 'Resume reading'
                    : ttsState === 'error'
                      ? 'Retry listening'
                      : 'Listen'
            }
            disabled={disabled || !content.trim()}
            onClick={() => {
              if (ttsState === 'playing' && onPauseAloud) onPauseAloud();
              else onReadAloud();
            }}
          >
            {ttsState === 'loading' ? (
              <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
            ) : ttsState === 'playing' ? (
              <Pause size={16} strokeWidth={1.75} />
            ) : (
              <Volume2 size={16} strokeWidth={1.75} />
            )}
          </button>
        ) : null}
        {ttsActive && onStopAloud ? (
          <button
            type="button"
            className={btn}
            aria-label="Stop reading"
            onClick={onStopAloud}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden
            >
              <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

const MessageActions = memo(MessageActionsInner);
export default MessageActions;
