'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Loader2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import type { TtsState } from '@/components/chat/MessageActions';

export interface MessageActionSheetProps {
  open: boolean;
  onClose: () => void;
  content: string;
  role: 'user' | 'assistant';
  disabled?: boolean;
  ttsState?: TtsState;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onEditPrompt?: () => void;
  onRetry?: () => void;
  onReadAloud?: () => void;
  onPauseAloud?: () => void;
  onStopAloud?: () => void;
}

type Feedback = 'up' | 'down' | null;

/**
 * Mobile long-press sheet for user bubbles (edit / copy / share).
 * Assistant actions use the always-visible MessageActions toolbar + More menu.
 */
export default function MessageActionSheet({
  open,
  onClose,
  content,
  role,
  disabled,
  ttsState = 'idle',
  onRegenerate,
  onContinue,
  onEditPrompt,
  onRetry,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
}: MessageActionSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<Feedback>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  const handleCopy = useCallback(async () => {
    const text = content.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        onClose();
      }, 650);
    } catch {
      onClose();
    }
  }, [content, onClose]);

  const handleShare = useCallback(async () => {
    const text = content.trim();
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* user cancelled share */
    }
    onClose();
  }, [content, onClose]);

  const ttsActive =
    ttsState === 'playing' ||
    ttsState === 'paused' ||
    ttsState === 'loading' ||
    ttsState === 'error';
  const isAssistant = role === 'assistant';

  const actions: {
    id: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    hidden?: boolean;
    accent?: boolean;
  }[] = [
    {
      id: 'copy',
      label: copied ? 'Copied' : 'Copy',
      icon: copied ? (
        <Check size={18} strokeWidth={2.25} />
      ) : (
        <Copy size={18} strokeWidth={1.75} />
      ),
      onClick: () => void handleCopy(),
      accent: copied,
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 size={18} strokeWidth={1.75} />,
      onClick: () => void handleShare(),
      hidden: !content.trim(),
    },
    {
      id: 'edit',
      label: 'Edit prompt',
      icon: <Pencil size={18} strokeWidth={1.75} />,
      onClick: () => {
        onEditPrompt?.();
        onClose();
      },
      hidden: !onEditPrompt,
    },
    {
      id: 'like',
      label: 'Like',
      icon: <ThumbsUp size={18} strokeWidth={1.75} />,
      onClick: () => setLiked((v) => (v === 'up' ? null : 'up')),
      accent: liked === 'up',
      hidden: !isAssistant,
    },
    {
      id: 'dislike',
      label: 'Dislike',
      icon: <ThumbsDown size={18} strokeWidth={1.75} />,
      onClick: () => setLiked((v) => (v === 'down' ? null : 'down')),
      accent: liked === 'down',
      hidden: !isAssistant,
    },
    {
      id: 'continue',
      label: 'Continue',
      icon: <Play size={18} strokeWidth={1.75} fill="currentColor" />,
      onClick: () => {
        onContinue?.();
        onClose();
      },
      hidden: !isAssistant || !onContinue,
      accent: true,
    },
    {
      id: 'retry',
      label: 'Retry',
      icon: <RotateCcw size={18} strokeWidth={1.75} />,
      onClick: () => {
        onRetry?.();
        onClose();
      },
      hidden: !isAssistant || !onRetry,
      accent: true,
    },
    {
      id: 'regenerate',
      label: 'Regenerate',
      icon: <RotateCcw size={18} strokeWidth={1.75} />,
      onClick: () => {
        onRegenerate?.();
        onClose();
      },
      hidden: !isAssistant || !onRegenerate || !!onRetry,
    },
    {
      id: 'read',
      label:
        ttsState === 'loading'
          ? 'Generating…'
          : ttsState === 'playing'
            ? 'Pause'
            : ttsState === 'paused'
              ? 'Resume'
              : ttsState === 'error'
                ? 'Retry'
                : 'Read Aloud',
      icon:
        ttsState === 'loading' ? (
          <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
        ) : ttsState === 'playing' ? (
          <Pause size={18} strokeWidth={1.75} />
        ) : (
          <Volume2 size={18} strokeWidth={1.75} />
        ),
      onClick: () => {
        if (ttsState === 'playing' && onPauseAloud) onPauseAloud();
        else onReadAloud?.();
        onClose();
      },
      accent: ttsActive,
      hidden: !isAssistant || !onReadAloud || !content.trim(),
    },
    {
      id: 'stop-read',
      label: 'Stop',
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
        </svg>
      ),
      onClick: () => {
        onStopAloud?.();
        onClose();
      },
      hidden: !isAssistant || !onStopAloud || !ttsActive,
    },
  ];

  const visible = actions.filter((a) => !a.hidden);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[280] md:hidden" role="presentation">
          <motion.button
            type="button"
            aria-label="Dismiss"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE.apple }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Message actions"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING.snappy}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 72 || info.velocity.y > 500) onClose();
            }}
            className={cn(
              'absolute inset-x-0 bottom-0 touch-none',
              'rounded-t-[22px] border border-border/70 border-b-0',
              'bg-surface-elevated shadow-[0_-8px_40px_rgba(0,0,0,0.28)]',
              'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
            )}
          >
            <div className="flex justify-center pt-3 pb-2" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-foreground/15" />
            </div>

            {content.trim() ? (
              <p className="mx-4 mb-3 line-clamp-2 rounded-[14px] bg-surface-hover px-3.5 py-2.5 text-sm leading-snug tracking-[-0.012em] text-text-secondary">
                {content.trim()}
              </p>
            ) : null}

            <div className="grid grid-cols-3 gap-1 px-3 pb-2 sm:grid-cols-3">
              {visible.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={disabled}
                  onClick={action.onClick}
                  className={cn(
                    'flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[16px] px-2',
                    'text-caption font-medium tracking-[-0.012em]',
                    'transition-colors duration-150 active:bg-surface-hover',
                    'disabled:pointer-events-none disabled:opacity-40',
                    action.accent ? 'text-accent' : 'text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full',
                      'bg-surface-hover',
                      action.accent && 'bg-accent-muted text-accent'
                    )}
                  >
                    {action.icon}
                  </span>
                  {action.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className={cn(
                'mx-3 mb-1 flex h-12 w-[calc(100%-1.5rem)] items-center justify-center',
                'rounded-full bg-surface-hover text-body font-semibold tracking-[-0.016em]',
                'text-foreground active:scale-[0.985] transition-transform'
              )}
            >
              Cancel
            </button>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
