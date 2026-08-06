'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useThemeContext } from '@/components/layout/ThemeProvider';
import MermaidRenderer from '@/components/artifacts/MermaidRenderer';
import MermaidToolbar from '@/components/artifacts/MermaidToolbar';
import {
  copyMermaidCode,
  downloadMermaidPng,
  downloadMermaidSvg,
} from '@/lib/mermaidExport';
import ErrorBoundary from '@/components/artifacts/ErrorBoundary';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;
const DEFAULT_DEBOUNCE_MS = 220;

export interface MermaidPreviewProps {
  content: string;
  className?: string;
  title?: string;
  /** Debounce live edits so typing stays snappy. */
  debounceMs?: number;
}

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/**
 * Interactive Mermaid artifact preview:
 * live render, pan, zoom, fit, fullscreen, copy, SVG/PNG export.
 * Theme follows the app light/dark mode.
 */
function MermaidPreviewInner({
  content,
  className,
  title = 'diagram',
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: MermaidPreviewProps) {
  const { theme } = useThemeContext();
  const debouncedCode = useDebouncedValue(content, debounceMs);
  const isPending = content !== debouncedCode;

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const [hasSvg, setHasSvg] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    const svg = svgRef.current;
    if (!viewport || !svg) {
      setTransform({ scale: 1, x: 0, y: 0 });
      return;
    }

    const pad = 48;
    const vw = Math.max(1, viewport.clientWidth - pad);
    const vh = Math.max(1, viewport.clientHeight - pad);

    // getBBox is in local SVG units (ignores CSS transform on ancestors).
    let naturalW = 0;
    let naturalH = 0;
    try {
      const box = svg.getBBox();
      naturalW = box.width;
      naturalH = box.height;
    } catch {
      /* getBBox unavailable */
    }

    if (naturalW < 1 || naturalH < 1) {
      // clientWidth/Height are layout sizes, not painted (scaled) sizes.
      naturalW =
        svg.clientWidth ||
        Number.parseFloat(svg.getAttribute('width') || '') ||
        svg.viewBox?.baseVal?.width ||
        0;
      naturalH =
        svg.clientHeight ||
        Number.parseFloat(svg.getAttribute('height') || '') ||
        svg.viewBox?.baseVal?.height ||
        0;
    }

    if (naturalW < 1 || naturalH < 1) {
      setTransform({ scale: 1, x: 0, y: 0 });
      return;
    }

    const scale = clampZoom(Math.min(vw / naturalW, vh / naturalH, 1.5));
    setTransform({ scale, x: 0, y: 0 });
  }, []);

  const handleSvgReady = useCallback(
    (svg: SVGSVGElement | null) => {
      svgRef.current = svg;
      setHasSvg(!!svg);
      if (svg) {
        // Measure after layout so getBBox / client rects are valid.
        requestAnimationFrame(() => fitToScreen());
      }
    },
    [fitToScreen]
  );

  // Re-fit when the panel resizes (split ↔ preview, fullscreen).
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (svgRef.current) fitToScreen();
      });
    });
    ro.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [fitToScreen]);

  // Track native fullscreen on the viewport shell.
  useEffect(() => {
    const onFs = () => {
      const el = viewportRef.current;
      setIsFullscreen(!!el && document.fullscreenElement === el);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const zoomBy = useCallback((factor: number, origin?: { x: number; y: number }) => {
    setTransform((prev) => {
      const nextScale = clampZoom(prev.scale * factor);
      if (nextScale === prev.scale) return prev;
      if (!origin) return { ...prev, scale: nextScale };

      // Zoom toward pointer within the viewport.
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: origin.x - (origin.x - prev.x) * ratio,
        y: origin.y - (origin.y - prev.y) * ratio,
      };
    });
  }, []);

  const handleZoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const handleZoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (!hasSvg) return;
      // Trackpad pinch often sets ctrlKey; also support meta/ctrl + scroll.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const origin = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomBy(factor, origin);
    },
    [hasSvg, zoomBy]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!hasSvg) return;
      // Primary button / touch only; ignore right-click.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Don't steal clicks from the toolbar.
      if (target.closest('[role="toolbar"], [role="menu"]')) return;

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: transform.x,
        originY: transform.y,
      };
      setIsPanning(true);
    },
    [hasSvg, transform.x, transform.y]
  );

  const handlePointerMove = useCallback((e: ReactPointerEvent) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    setTransform((prev) => ({
      ...prev,
      x: pan.originX + (e.clientX - pan.startX),
      y: pan.originY + (e.clientY - pan.startY),
    }));
  }, []);

  const endPan = useCallback((e: ReactPointerEvent) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const el = viewportRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* Fullscreen may be blocked by browser policy */
    }
  }, []);

  const handleCopy = useCallback(() => copyMermaidCode(content), [content]);

  const handleDownloadSvg = useCallback(() => {
    if (!svgRef.current) return;
    downloadMermaidSvg(svgRef.current, title);
  }, [title]);

  const handleDownloadPng = useCallback(async () => {
    if (!svgRef.current) return;
    await downloadMermaidPng(svgRef.current, title);
  }, [title]);

  const zoomPercent = Math.round(transform.scale * 100);

  return (
    <ErrorBoundary title="Mermaid preview crashed" className={className}>
      <div
        ref={viewportRef}
        className={cn(
          'relative flex h-full min-h-0 w-full flex-col overflow-hidden',
          'bg-[#fbfbfd] dark:bg-[#0e0e10]',
          // Subtle grid so large diagrams feel grounded.
          '[background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.055)_1px,transparent_0)] dark:[background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)]',
          '[background-size:18px_18px]',
          isFullscreen && 'bg-[#fbfbfd] dark:bg-[#0e0e10]',
          className
        )}
        onWheel={handleWheel}
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
            'relative min-h-0 flex-1 overflow-hidden',
            isPanning ? 'cursor-grabbing' : hasSvg ? 'cursor-grab' : 'cursor-default'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <div className="flex h-full w-full items-center justify-center p-6 pb-16">
            <div
              ref={stageRef}
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: 'center center',
                willChange: 'transform',
              }}
              className="transition-[opacity] duration-150"
            >
              <MermaidRenderer
                code={debouncedCode}
                theme={theme}
                onSvgReady={handleSvgReady}
 />
            </div>
          </div>
        </div>

        <MermaidToolbar
          zoomPercent={zoomPercent}
          canZoomIn={transform.scale < MAX_ZOOM - 0.01}
          canZoomOut={transform.scale > MIN_ZOOM + 0.01}
          isFullscreen={isFullscreen}
          hasSvg={hasSvg}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={fitToScreen}
          onToggleFullscreen={handleToggleFullscreen}
          onCopyCode={handleCopy}
          onDownloadSvg={handleDownloadSvg}
          onDownloadPng={handleDownloadPng}
 />
      </div>
    </ErrorBoundary>
  );
}

const MermaidPreview = memo(MermaidPreviewInner);
export default MermaidPreview;
