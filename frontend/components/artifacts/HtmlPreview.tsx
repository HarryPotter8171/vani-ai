'use client';

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  IFRAME_SANDBOX,
  PREVIEW_VIEWPORT_WIDTHS,
  type PreviewViewport,
} from '@/lib/artifactPreview';

const DEFAULT_DEBOUNCE_MS = 280;

export interface HtmlPreviewProps {
  /** Fully-built HTML document for iframe srcDoc. */
  srcDoc: string;
  title?: string;
  className?: string;
  /** Device frame width. */
  viewport?: PreviewViewport;
  /** Debounce delay for live srcDoc updates while typing. */
  debounceMs?: number;
  /**
   * Increment to force a hard remount/refresh of the iframe
   * (clears in-document JS state without a parent page reload).
   */
  refreshKey?: number;
  /** Show a subtle "Updating…" indicator while debounce is pending. */
  showPendingIndicator?: boolean;
}

/**
 * Production live HTML preview:
 * - Sandboxed iframe (no same-origin, popups, or top navigation)
 * - Debounced srcDoc updates (no full page reloads)
 * - Responsive viewport frames (desktop / tablet / mobile)
 * - Explicit refresh via remount key
 * - Stable identity to avoid unnecessary remounts / memory leaks
 */
function HtmlPreviewInner({
  srcDoc,
  title = 'HTML preview',
  className,
  viewport = 'desktop',
  debounceMs = DEFAULT_DEBOUNCE_MS,
  refreshKey = 0,
  showPendingIndicator = true,
}: HtmlPreviewProps) {
  const debouncedSrcDoc = useDebouncedValue(srcDoc, debounceMs);
  const isPending = showPendingIndicator && srcDoc !== debouncedSrcDoc;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Clear iframe document on unmount / hard refresh to help GC of large srcDoc strings.
  // Remount is driven by key={refreshKey} on the iframe (no setState in an effect).
  useEffect(() => {
    const iframe = iframeRef.current;
    return () => {
      if (!iframe) return;
      try {
        iframe.srcdoc = '';
        iframe.removeAttribute('srcdoc');
      } catch {
        /* ignore */
      }
    };
  }, [refreshKey]);

  const frameWidth = PREVIEW_VIEWPORT_WIDTHS[viewport];
  const isFramed = viewport !== 'desktop';

  const frameStyle = useMemo(
    () =>
      isFramed
        ? {
            width: typeof frameWidth === 'number' ? `${frameWidth}px` : frameWidth,
            maxWidth: '100%',
          }
        : undefined,
    [frameWidth, isFramed]
  );

  const handleLoad = useCallback(() => {
    // Intentionally empty — reserved for future console bridging.
    // Keeping a stable callback identity avoids iframe churn.
  }, []);

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col',
        isFramed && 'items-center bg-[#ececf0] dark:bg-[#141416]',
        className
      )}
    >
      {isPending && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-micro font-medium tracking-wide text-white backdrop-blur-sm"
          aria-live="polite"
        >
          Updating…
        </div>
      )}

      <div
        className={cn(
          'relative min-h-0 flex-1',
          isFramed ? 'my-4 overflow-auto px-4' : 'w-full'
        )}
      >
        <div
          className={cn(
            'h-full overflow-hidden bg-white',
            isFramed &&
              'mx-auto shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_40px_rgba(0,0,0,0.10)] ring-1 ring-black/5 dark:ring-white/10',
            viewport === 'mobile' && 'rounded-[28px]',
            viewport === 'tablet' && 'rounded-[16px]'
          )}
          style={
            isFramed
              ? { ...frameStyle, height: '100%', minHeight: 320 }
              : { height: '100%', width: '100%' }
          }
        >
          <iframe
            key={refreshKey}
            ref={iframeRef}
            title={title}
            srcDoc={debouncedSrcDoc}
            sandbox={IFRAME_SANDBOX}
            referrerPolicy="no-referrer"
            onLoad={handleLoad}
            className="h-full w-full border-0 bg-white"
            // Isolation from parent styles; clipboard demos still work via
            // the host Copy button, not the iframe.
 />
        </div>
      </div>
    </div>
  );
}

const HtmlPreview = memo(HtmlPreviewInner);
export default HtmlPreview;
