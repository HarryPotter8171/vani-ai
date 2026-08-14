'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Mic, MicOff, ShieldAlert, WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import {
  micFailureMessage,
  micFailureTitle,
  type MicFailureReason,
} from '@/lib/voice/microphone';

export interface MicPermissionDialogProps {
  open: boolean;
  reason: MicFailureReason;
  requesting?: boolean;
  onClose: () => void;
  onRetry: () => void;
}

function ReasonIcon({ reason }: { reason: MicFailureReason }) {
  if (reason === 'insecure') return <WifiOff size={20} strokeWidth={1.75} />;
  if (reason === 'unsupported') return <ShieldAlert size={20} strokeWidth={1.75} />;
  if (reason === 'unavailable') return <MicOff size={20} strokeWidth={1.75} />;
  return <Mic size={20} strokeWidth={1.75} />;
}

/**
 * Friendly mic permission recovery for denied / blocked / unavailable /
 * unsupported / insecure contexts. Never deep-links into OS settings.
 */
export default function MicPermissionDialog({
  open,
  reason,
  requesting = false,
  onClose,
  onRetry,
}: MicPermissionDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !requesting) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, requesting]);

  if (!mounted) return null;

  const title = micFailureTitle(reason);
  const message = micFailureMessage(reason);
  const showSettingsHelp =
    reason === 'denied' || reason === 'blocked' || reason === 'allow';
  const primaryLabel =
    reason === 'allow'
      ? 'Allow microphone'
      : reason === 'insecure' || reason === 'unsupported'
        ? 'Continue with text'
        : 'Try again';
  const primaryIsDismiss =
    reason === 'insecure' || reason === 'unsupported';

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-0 z-[230] flex items-end justify-center sm:items-center sm:p-5">
          <motion.button
            type="button"
            aria-label="Dismiss"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE.apple }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => {
              if (!requesting) onClose();
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mic-permission-title"
            aria-describedby="mic-permission-desc"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={SPRING.snappy}
            className={cn(
              'relative z-[1] w-full overflow-hidden',
              'rounded-t-[22px] border border-border/70 border-b-0 bg-surface-elevated shadow-3',
              'sm:max-w-[400px] sm:rounded-[22px] sm:border-b',
              'pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-5'
            )}
          >
            <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-foreground/15" />
            </div>

            <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]',
                  reason === 'allow'
                    ? 'bg-accent-muted text-accent'
                    : 'bg-danger-muted text-danger'
                )}
                aria-hidden
              >
                <ReasonIcon reason={reason} />
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={requesting}
                aria-label="Close"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-hover hover:text-foreground touch-manipulation disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-3 pb-5">
              <h2
                id="mic-permission-title"
                className="text-lg font-semibold tracking-[-0.024em] text-foreground"
              >
                {title}
              </h2>
              <p
                id="mic-permission-desc"
                className="mt-2 text-sm leading-relaxed tracking-[-0.01em] text-text-secondary"
              >
                {message}
              </p>

              {showSettingsHelp ? (
                <div className="mt-4 space-y-2.5 rounded-[16px] bg-surface-hover/80 px-3.5 py-3">
                  <div className="min-w-0 text-caption leading-relaxed text-text-secondary">
                    <p className="font-medium text-foreground">iPhone / iPad</p>
                    <p className="mt-0.5">
                      Settings → Safari (or Chrome) → Microphone → Allow for this
                      site, then return here.
                    </p>
                  </div>
                  <div className="min-w-0 text-caption leading-relaxed text-text-secondary">
                    <p className="font-medium text-foreground">Android (Chrome)</p>
                    <p className="mt-0.5">
                      Tap the lock / tune icon in the address bar → Permissions →
                      Microphone → Allow, then return here and tap Try again.
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="mt-3 text-caption leading-relaxed text-text-tertiary">
                You can keep chatting with text anytime — Voice Mode is optional.
              </p>

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
                <Button
                  type="button"
                  className="h-12 w-full touch-manipulation sm:h-11 sm:flex-1"
                  loading={requesting}
                  disabled={requesting}
                  onClick={primaryIsDismiss ? onClose : onRetry}
                >
                  {requesting ? 'Requesting…' : primaryLabel}
                </Button>
                {!primaryIsDismiss ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-12 w-full touch-manipulation sm:h-11 sm:flex-1"
                    disabled={requesting}
                    onClick={onClose}
                  >
                    Use text chat
                  </Button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/** Detect browser mic permission denial from getUserMedia / SpeechRecognition. */
export function isMicrophonePermissionDenied(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === 'string') {
    const s = err.toLowerCase();
    return (
      s === 'not-allowed' ||
      s.includes('permission denied') ||
      s.includes('notallowed') ||
      s.includes('microphone permission')
    );
  }
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'NotAllowedError' ||
      err.name === 'PermissionDeniedError' ||
      err.name === 'SecurityError' ||
      /permission/i.test(err.message)
    );
  }
  if (err instanceof Error) {
    const blob = `${err.name} ${err.message}`.toLowerCase();
    return (
      err.name === 'NotAllowedError' ||
      err.name === 'PermissionDeniedError' ||
      err.name === 'SecurityError' ||
      blob.includes('permission denied') ||
      blob.includes('notallowed')
    );
  }
  return false;
}
