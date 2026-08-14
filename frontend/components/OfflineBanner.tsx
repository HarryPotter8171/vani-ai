'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';
import { useWasOffline } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';

/**
 * Global offline / reconnect banner.
 * Shows: "You're offline. We'll reconnect automatically."
 * Auto-hides when the browser comes back online.
 */
export function OfflineBanner() {
  const { online, justReconnected } = useWasOffline();
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Soft connectivity probe while offline — helps some browsers refresh onLine sooner.
  useEffect(() => {
    if (online) {
      if (retryRef.current) {
        clearInterval(retryRef.current);
        retryRef.current = null;
      }
      return;
    }

    retryRef.current = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        // Force a re-check by dispatching online if the flag flipped.
        window.dispatchEvent(new Event('online'));
      }
    }, 4000);

    return () => {
      if (retryRef.current) {
        clearInterval(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [online]);

  const showOffline = !online;
  const showBack = online && justReconnected;

  return (
    <AnimatePresence>
      {showOffline ? (
        <motion.div
          key="offline"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING.snappy}
          className={cn(
            'fixed inset-x-0 top-0 z-[220] flex justify-center px-3',
            'pt-[max(0.5rem,env(safe-area-inset-top,0px))]'
          )}
        >
          <div
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-2.5',
              'rounded-b-[16px] rounded-t-[4px] px-4 py-2.5',
              'bg-surface-elevated/95 text-foreground',
              'border border-border border-t-0 shadow-2',
              'backdrop-blur-[20px] backdrop-saturate-[1.4]'
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-warning-muted text-warning">
              <WifiOff size={15} strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold tracking-[-0.016em]">
                You&apos;re offline
              </p>
              <p className="text-caption leading-snug text-text-secondary">
                We&apos;ll reconnect automatically.
              </p>
            </div>
          </div>
        </motion.div>
      ) : showBack ? (
        <motion.div
          key="online"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING.snappy}
          className={cn(
            'fixed inset-x-0 top-0 z-[220] flex justify-center px-3',
            'pt-[max(0.5rem,env(safe-area-inset-top,0px))]'
          )}
        >
          <div
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-2.5',
              'rounded-b-[16px] rounded-t-[4px] px-4 py-2.5',
              'bg-surface-elevated/95 text-foreground',
              'border border-border border-t-0 shadow-2',
              'backdrop-blur-[20px] backdrop-saturate-[1.4]'
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-success-muted text-success">
              <Wifi size={15} strokeWidth={2.25} aria-hidden />
            </span>
            <p className="text-sm font-semibold tracking-[-0.016em]">
              You&apos;re back online
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default OfflineBanner;
