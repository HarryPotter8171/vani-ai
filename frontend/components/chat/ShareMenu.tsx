'use client';

import React, { useRef, useState } from 'react';
import { Check, Copy, Globe2, Link2, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useShareChat } from '@/hooks/useShareChat';
import { useToast } from '@/components/ui/Toast';

export interface ShareMenuProps {
  /** The persisted chat id to share, or `null` for a not-yet-saved / no conversation (disables the button). */
  chatId: string | null;
}

export default function ShareMenu({ chatId }: ShareMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const { isShared, shareUrl, isLoadingStatus, isToggling, error, ensureStatusLoaded, enable, disable } =
    useShareChat(chatId);

  useOnClickOutside(containerRef, () => setMenuOpen(false), menuOpen);

  const toggleMenu = () => {
    setMenuOpen((wasOpen) => {
      if (!wasOpen) ensureStatusLoaded();
      return !wasOpen;
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Unable to copy the link — please copy it manually.', 'error');
    }
  };

  const handleToggleShare = async () => {
    if (isShared) {
      await disable();
    } else {
      await enable();
      showToast('Anyone with the link can now view this conversation.', 'success');
    }
  };

  const busy = isLoadingStatus || isToggling;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleMenu}
        disabled={!chatId}
        className={cn(
          'hover-lift inline-flex h-7 w-7 items-center justify-center rounded-full',
          'text-muted-foreground/80',
          'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'hover:bg-foreground/[0.045] hover:text-foreground',
          'dark:hover:bg-white/[0.06]',
          'disabled:pointer-events-none disabled:opacity-35',
          menuOpen && 'bg-foreground/[0.045] text-foreground dark:bg-white/[0.06]'
        )}
        aria-label="Share conversation"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <Share2 size={15} strokeWidth={1.75} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 bottom-full mb-2 z-30 w-[290px] overflow-hidden rounded-[16px]',
            'menu-surface rounded-[16px] shadow-token-lg',
            'animate-fade-up'
          )}
        >
          <div className="px-4 pb-1.5 pt-3.5 text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">
            Share conversation
          </div>

          <div className="px-4 pb-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]',
                    isShared
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-surface-hover text-muted-foreground'
                  )}
                >
                  <Globe2 size={13} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium tracking-[-0.014em] text-foreground">
                    {isShared ? 'Public link is on' : 'Public link is off'}
                  </span>
                  <span className="block text-micro leading-[1.4] text-muted-foreground/65">
                    {isShared
                      ? 'Anyone with the link can view this conversation.'
                      : 'Only you can see this conversation.'}
                  </span>
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isShared}
                aria-label="Toggle public link"
                onClick={handleToggleShare}
                disabled={busy}
                className={cn(
                  'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200',
                  isShared ? 'bg-primary' : 'bg-black/[0.14] dark:bg-white/[0.18]',
                  busy && 'opacity-60'
                )}
              >
                <span
                  className={cn(
                    'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm',
                    'transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                    isShared ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  )}
 />
              </button>
            </div>

            {error && <p className="pb-1.5 text-micro text-red-500/80">{error}</p>}

            {isShared && shareUrl && (
              <div
                className={cn(
                  'mt-1 flex items-center gap-1.5 rounded-[12px] p-1.5 pl-3',
                  'border border-black/[0.06] bg-black/[0.02]',
                  'dark:border-white/[0.08] dark:bg-white/[0.03]'
                )}
              >
                <Link2 size={12} className="shrink-0 text-muted-foreground/50" />
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                  aria-label="Share link"
                  className="min-w-0 flex-1 truncate bg-transparent text-micro text-muted-foreground focus-ring-token"
 />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 py-1.5',
                    'text-micro font-medium transition-colors duration-150',
                    copied ? 'bg-emerald-500/10 text-emerald-500' : 'bg-accent text-text-on-accent hover:brightness-110'
                  )}
                >
                  {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            <p className="mt-2.5 text-micro leading-[1.5] text-muted-foreground/50">
              Shared conversations are read-only — Markdown formatting and code blocks render exactly as shown here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
