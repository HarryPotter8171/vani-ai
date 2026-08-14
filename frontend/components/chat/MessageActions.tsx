'use client';

import React, { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  Bookmark,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  PanelRight,
  Pause,
  Pencil,
  Pin,
  RotateCcw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DROPDOWN_MOTION, EASE, SPRING } from '@/lib/motion';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useIsDesktop } from '@/hooks/useMediaQuery';

export type TtsState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface MessageMoreActions {
  onRegenerate?: () => void;
  onEditPrompt?: () => void;
  onOpenCanvas?: () => void;
  onShare?: () => void;
  onPin?: () => void;
  onSave?: () => void;
  onExportMarkdown?: () => void;
  onExportPdf?: () => void;
  onDelete?: () => void;
  pinned?: boolean;
}

export interface MessageActionsProps extends MessageMoreActions {
  content: string;
  disabled?: boolean;
  ttsState?: TtsState;
  feedback?: 'up' | 'down' | null;
  onContinue?: () => void;
  onFeedback?: (value: 'up' | 'down' | null) => void;
  onReadAloud?: () => void;
  onPauseAloud?: () => void;
  onStopAloud?: () => void;
  /**
   * @deprecated Actions are always visible. Kept for call-site compatibility.
   */
  hoverReveal?: boolean;
  /**
   * @deprecated Actions are always visible. Kept for call-site compatibility.
   */
  keepVisible?: boolean;
}

function MessageActionsInner({
  content,
  disabled,
  ttsState = 'idle',
  feedback: feedbackProp,
  onContinue,
  onFeedback,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
  hoverReveal: _hoverReveal = false,
  keepVisible: _keepVisible = true,
  onRegenerate,
  onEditPrompt,
  onOpenCanvas,
  onShare,
  onPin,
  onSave,
  onExportMarkdown,
  onExportPdf,
  onDelete,
  pinned = false,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<'up' | 'down' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isDesktop = useIsDesktop();
  const liked = feedbackProp !== undefined ? feedbackProp : localFeedback;

  useEffect(() => setPortalReady(true), []);
  useOnClickOutside(moreRef, () => setMoreOpen(false), moreOpen && isDesktop);

  useEffect(() => {
    if (!moreOpen || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen, isDesktop]);

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

  const setLiked = (value: 'up' | 'down' | null) => {
    if (onFeedback) onFeedback(value);
    else setLocalFeedback(value);
  };

  const ttsActive =
    ttsState === 'playing' ||
    ttsState === 'paused' ||
    ttsState === 'loading' ||
    ttsState === 'error';

  const listenLabel =
    ttsState === 'loading'
      ? 'Generating audio'
      : ttsState === 'playing'
        ? 'Pause'
        : ttsState === 'paused'
          ? 'Play'
          : ttsState === 'error'
            ? 'Retry listening'
            : 'Listen';

  const moreItems = useMemo(() => {
    const items: {
      id: string;
      label: string;
      icon: React.ReactNode;
      onSelect: () => void;
      danger?: boolean;
      hidden?: boolean;
    }[] = [
      {
        id: 'canvas',
        label: 'Open in Canvas',
        icon: <PanelRight size={16} strokeWidth={1.75} />,
        onSelect: () => onOpenCanvas?.(),
        hidden: !onOpenCanvas,
      },
      {
        id: 'share',
        label: 'Share',
        icon: <Share2 size={16} strokeWidth={1.75} />,
        onSelect: () => onShare?.(),
        hidden: !onShare,
      },
      {
        id: 'regenerate',
        label: 'Regenerate',
        icon: <RotateCcw size={16} strokeWidth={1.75} />,
        onSelect: () => onRegenerate?.(),
        hidden: !onRegenerate,
      },
      {
        id: 'edit',
        label: 'Edit Prompt',
        icon: <Pencil size={16} strokeWidth={1.75} />,
        onSelect: () => onEditPrompt?.(),
        hidden: !onEditPrompt,
      },
      {
        id: 'pin',
        label: pinned ? 'Unpin Message' : 'Pin Message',
        icon: <Pin size={16} strokeWidth={1.75} />,
        onSelect: () => onPin?.(),
        hidden: !onPin,
      },
      {
        id: 'save',
        label: 'Save Response',
        icon: <Bookmark size={16} strokeWidth={1.75} />,
        onSelect: () => onSave?.(),
        hidden: !onSave,
      },
      {
        id: 'export-md',
        label: 'Export Markdown',
        icon: <FileText size={16} strokeWidth={1.75} />,
        onSelect: () => onExportMarkdown?.(),
        hidden: !onExportMarkdown,
      },
      {
        id: 'export-pdf',
        label: 'Export PDF',
        icon: <Download size={16} strokeWidth={1.75} />,
        onSelect: () => onExportPdf?.(),
        hidden: !onExportPdf,
      },
      {
        id: 'delete',
        label: 'Delete Response',
        icon: <Trash2 size={16} strokeWidth={1.75} />,
        onSelect: () => onDelete?.(),
        danger: true,
        hidden: !onDelete,
      },
    ];
    return items.filter((i) => !i.hidden);
  }, [
    onRegenerate,
    onEditPrompt,
    onOpenCanvas,
    onShare,
    onPin,
    onSave,
    onExportMarkdown,
    onExportPdf,
    onDelete,
    pinned,
  ]);

  const runMore = (item: (typeof moreItems)[number]) => {
    setMoreOpen(false);
    item.onSelect();
  };

  const btn = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full',
    'h-10 w-10 md:h-8 md:w-8',
    'text-text-tertiary',
    'transition-[opacity,color,transform,background-color] duration-150 ease-out',
    'hover:bg-surface-hover hover:text-foreground',
    'active:scale-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
    'disabled:pointer-events-none disabled:opacity-30',
    'touch-manipulation'
  );

  // Like / Dislike / Listen / Copy / More — always visible after streaming.
  void _hoverReveal;
  void _keepVisible;

  return (
    <div className="flex w-full max-w-full flex-col gap-2 pt-2">
      {onContinue ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onContinue}
          className={cn(
            'inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 md:py-1.5',
            'text-sm font-medium tracking-[-0.02em]',
            'bg-surface-secondary/90 text-foreground',
            'ring-1 ring-border-subtle/70',
            'transition-[transform,background-color] duration-150',
            'hover:bg-surface-hover hover:ring-accent/30',
            'active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
            'disabled:pointer-events-none disabled:opacity-40'
          )}
        >
          Continue generating
        </button>
      ) : null}

      <div
        className={cn(
          'msg-actions-toolbar flex w-full max-w-full items-center justify-between gap-0.5',
          'md:w-fit md:justify-start md:gap-0.5',
          'rounded-full bg-surface-secondary/60 p-0.5 ring-1 ring-border-subtle/40',
          'overflow-hidden',
          'opacity-100'
        )}
        role="group"
        aria-label="Message actions"
      >
        <button
          type="button"
          className={cn(btn, liked === 'up' && 'bg-accent-muted text-accent')}
          aria-label="Like"
          aria-pressed={liked === 'up'}
          disabled={disabled}
          onClick={() => setLiked(liked === 'up' ? null : 'up')}
        >
          <ThumbsUp size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
        </button>
        <button
          type="button"
          className={cn(btn, liked === 'down' && 'bg-accent-muted text-accent')}
          aria-label="Dislike"
          aria-pressed={liked === 'down'}
          disabled={disabled}
          onClick={() => setLiked(liked === 'down' ? null : 'down')}
        >
          <ThumbsDown size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
        </button>

        {onReadAloud ? (
          <button
            type="button"
            className={cn(
              btn,
              ttsActive && 'text-accent',
              ttsState === 'error' && 'text-red-500'
            )}
            aria-label={listenLabel}
            aria-busy={ttsState === 'loading'}
            disabled={disabled || !content.trim()}
            onClick={() => {
              if (ttsState === 'playing' && onPauseAloud) onPauseAloud();
              else onReadAloud();
            }}
          >
            {ttsState === 'loading' ? (
              <Loader2
                size={17}
                strokeWidth={1.75}
                className="animate-spin md:h-[15px] md:w-[15px]"
              />
            ) : ttsState === 'playing' ? (
              <Pause size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
            ) : (
              <Volume2 size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
            )}
          </button>
        ) : null}

        <button
          type="button"
          className={cn(btn, 'relative', copied && 'text-emerald-600 dark:text-emerald-400')}
          aria-label={copied ? 'Copied' : 'Copy'}
          disabled={disabled || !content.trim()}
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check size={17} strokeWidth={2.25} className="md:h-[15px] md:w-[15px]" />
          ) : (
            <Copy size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
          )}
          <AnimatePresence>
            {copied ? (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2.5 py-1 text-micro font-semibold text-background shadow-token-sm"
              >
                Copied ✓
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>

        <div ref={moreRef} className="relative shrink-0">
          <button
            type="button"
            className={cn(btn, moreOpen && 'bg-surface-hover text-foreground')}
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls={menuId}
            disabled={disabled || moreItems.length === 0}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreHorizontal size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
          </button>

          {/* Desktop dropdown */}
          {isDesktop ? (
            <AnimatePresence>
              {moreOpen ? (
                <motion.div
                  id={menuId}
                  role="menu"
                  aria-label="More message actions"
                  {...DROPDOWN_MOTION}
                  className={cn(
                    'absolute bottom-full left-0 z-50 mb-1.5 min-w-[200px] overflow-hidden rounded-[16px] p-1.5',
                    'menu-surface md:left-auto md:right-0'
                  )}
                >
                  {moreItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => runMore(item)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2',
                        'text-left text-sm font-medium tracking-[-0.014em]',
                        'transition-colors duration-fast',
                        item.danger
                          ? 'text-danger hover:bg-danger-muted'
                          : 'text-foreground hover:bg-surface-hover'
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          ) : null}
        </div>
      </div>

      {/* Mobile more sheet */}
      {portalReady && !isDesktop
        ? createPortal(
            <AnimatePresence>
              {moreOpen ? (
                <div className="fixed inset-0 z-[280] md:hidden" role="presentation">
                  <motion.button
                    type="button"
                    aria-label="Dismiss"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE.apple }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                    onClick={() => setMoreOpen(false)}
                  />
                  <motion.div
                    id={menuId}
                    role="dialog"
                    aria-modal="true"
                    aria-label="More message actions"
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={SPRING.snappy}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0.04, bottom: 0.55 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.y > 72 || info.velocity.y > 500) setMoreOpen(false);
                    }}
                    className={cn(
                      'absolute inset-x-0 bottom-0',
                      'rounded-t-[22px] border border-border/70 border-b-0',
                      'bg-surface-elevated shadow-[0_-8px_40px_rgba(0,0,0,0.28)]',
                      'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
                    )}
                  >
                    <div className="flex justify-center pt-3 pb-2" aria-hidden>
                      <span className="h-1 w-9 rounded-full bg-foreground/15" />
                    </div>
                    <ul className="flex flex-col px-2 pb-2">
                      {moreItems.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => runMore(item)}
                            className={cn(
                              'flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-3.5',
                              'text-left text-body font-medium tracking-[-0.016em]',
                              'active:bg-surface-hover',
                              item.danger ? 'text-danger' : 'text-foreground'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover',
                                item.danger && 'bg-danger-muted text-danger'
                              )}
                            >
                              {item.icon}
                            </span>
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setMoreOpen(false)}
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
          )
        : null}
    </div>
  );
}

const MessageActions = memo(MessageActionsInner);
export default MessageActions;
