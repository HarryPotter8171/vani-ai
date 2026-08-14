'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { getUserFriendlyError } from '@/lib/userFacingError';

export type ToastVariant = 'error' | 'success' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (
    message: string,
    variant?: ToastVariant,
    options?: { action?: ToastAction; duration?: number }
  ) => void;
  /** Success toast — short product confirmation (e.g. "Chat deleted"). */
  toastSuccess: (message: string, options?: { action?: ToastAction; duration?: number }) => void;
  /** Warning toast — recoverable attention (e.g. "Connection lost"). */
  toastWarning: (message: string, options?: { action?: ToastAction; duration?: number }) => void;
  /** Error toast — sanitizes technical messages automatically. */
  toastError: (message: unknown, options?: { action?: ToastAction; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_META: Record<
  ToastVariant,
  { icon: typeof Info; iconClass: string; barClass: string }
> = {
  error: {
    icon: AlertCircle,
    iconClass: 'text-danger',
    barClass: 'bg-danger',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-success',
    barClass: 'bg-success',
  },
  info: {
    icon: Info,
    iconClass: 'text-accent',
    barClass: 'bg-accent',
  },
  warning: {
    icon: AlertCircle,
    iconClass: 'text-warning',
    barClass: 'bg-warning',
  },
};

const AUTO_DISMISS_MS = 4500;
const MAX_TOASTS = 4;

function makeToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const durationsRef = useRef<Map<string, number>>(new Map());
  const toastsRef = useRef<ToastItem[]>([]);

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearTimer(id);
      durationsRef.current.delete(id);
      setToasts((prev) => {
        if (!prev.some((t) => t.id === id)) return prev;
        return prev.filter((t) => t.id !== id);
      });
    },
    [clearTimer]
  );

  const dismissRef = useRef(dismissToast);
  useEffect(() => {
    dismissRef.current = dismissToast;
  }, [dismissToast]);

  const scheduleDismiss = useCallback(
    (id: string, duration = AUTO_DISMISS_MS) => {
      clearTimer(id);
      durationsRef.current.set(id, duration);
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id);
          dismissRef.current(id);
        }, duration)
      );
    },
    [clearTimer]
  );

  const showToast = useCallback(
    (
      message: string,
      variant: ToastVariant = 'info',
      options?: { action?: ToastAction; duration?: number }
    ) => {
      // Errors always go through the friendly mapper; other variants keep
      // product copy as-is unless it looks like raw technical noise.
      const trimmed =
        variant === 'error'
          ? getUserFriendlyError(message)
          : String(message ?? '').trim();
      if (!trimmed) return;

      if (variant === 'error' && typeof console !== 'undefined') {
        const original = String(message ?? '').trim();
        if (original && original !== trimmed) {
          console.error('[toast]', original);
        }
      }

      const existing = toastsRef.current.find(
        (t) => t.message === trimmed && t.variant === variant
      );
      if (existing) {
        scheduleDismiss(existing.id, options?.duration ?? AUTO_DISMISS_MS);
        return;
      }

      const id = makeToastId();
      setToasts((prev) => {
        if (prev.some((t) => t.message === trimmed && t.variant === variant)) {
          return prev;
        }
        const next = [...prev, { id, message: trimmed, variant, action: options?.action }];
        return next.slice(-MAX_TOASTS);
      });
      scheduleDismiss(id, options?.duration ?? AUTO_DISMISS_MS);
    },
    [scheduleDismiss]
  );

  const toastSuccess = useCallback(
    (message: string, options?: { action?: ToastAction; duration?: number }) => {
      showToast(message, 'success', options);
    },
    [showToast]
  );

  const toastWarning = useCallback(
    (message: string, options?: { action?: ToastAction; duration?: number }) => {
      showToast(message, 'warning', options);
    },
    [showToast]
  );

  const toastError = useCallback(
    (message: unknown, options?: { action?: ToastAction; duration?: number }) => {
      showToast(getUserFriendlyError(message), 'error', options);
    },
    [showToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, toastSuccess, toastWarning, toastError }),
    [showToast, toastSuccess, toastWarning, toastError]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] z-[210] flex flex-col items-center gap-2.5 px-4 sm:bottom-8">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const { icon: Icon, iconClass, barClass } = VARIANT_META[toast.variant];
            const duration = durationsRef.current.get(toast.id) ?? AUTO_DISMISS_MS;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={SPRING.snappy}
                role="alert"
                className={cn(
                  'pointer-events-auto relative flex max-w-sm items-center gap-2.5 overflow-hidden',
                  'rounded-[18px] px-3.5 py-3 pr-2.5',
                  'bg-surface-elevated/95 text-foreground',
                  'border border-border',
                  'backdrop-blur-[24px] backdrop-saturate-[1.6]',
                  'shadow-3',
                  'active:scale-[0.98] transition-transform duration-fast'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px]',
                    toast.variant === 'error' && 'bg-danger-muted',
                    toast.variant === 'success' && 'bg-success-muted',
                    toast.variant === 'warning' && 'bg-warning-muted',
                    toast.variant === 'info' && 'bg-accent-muted'
                  )}
                  aria-hidden
                >
                  <Icon size={15} strokeWidth={2.25} className={iconClass} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-[1.35] tracking-[-0.016em]">
                  {toast.message}
                </span>
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismissToast(toast.id);
                    }}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5',
                      'min-h-[44px] min-w-[44px] justify-center sm:min-h-0 sm:min-w-0',
                      'text-caption font-semibold tracking-[-0.014em]',
                      'bg-accent-muted text-accent hover:bg-accent/20',
                      'transition-colors duration-fast touch-manipulation'
                    )}
                  >
                    <RotateCcw size={11} strokeWidth={2.5} />
                    {toast.action.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className={cn(
                    'shrink-0 rounded-full p-2.5 text-text-tertiary',
                    'min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0 sm:p-1',
                    'transition-colors duration-fast ease-apple',
                    'hover:bg-surface-hover hover:text-foreground',
                    'active:scale-95 touch-manipulation'
                  )}
                >
                  <X size={13} />
                </button>
                <motion.span
                  aria-hidden
                  className={cn('absolute inset-x-0 bottom-0 h-[2px] origin-left', barClass)}
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: duration / 1000, ease: 'linear' }}
 />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
