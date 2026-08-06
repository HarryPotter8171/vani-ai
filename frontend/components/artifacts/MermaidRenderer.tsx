'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { Theme } from '@/hooks/useTheme';

export type MermaidTheme = Theme;

export interface MermaidRendererProps {
  /** Mermaid source (trimmed before render). */
  code: string;
  theme: MermaidTheme;
  className?: string;
  /** Called with the live SVG element after a successful render. */
  onSvgReady?: (svg: SVGSVGElement | null) => void;
  /** Soft loading indicator while Mermaid is parsing / drawing. */
  showLoading?: boolean;
}

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (
    id: string,
    text: string
  ) => Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
};

let mermaidLoader: Promise<MermaidApi> | null = null;
let lastInitKey = '';

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => mod.default as unknown as MermaidApi);
  }
  return mermaidLoader;
}

function initMermaid(api: MermaidApi, theme: MermaidTheme): void {
  const key = theme;
  if (lastInitKey === key) return;
  lastInitKey = key;
  api.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'neutral',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    flowchart: { htmlLabels: true, curve: 'basis' },
    sequence: { actorMargin: 48, messageMargin: 36 },
    er: { entityPadding: 16 },
    gantt: { useMaxWidth: true } });
}

let renderCounter = 0;

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const firstLine = raw.split('\n')[0]?.trim() || 'Invalid Mermaid diagram';
  if (/parse error|syntax error|lexical error|expecting/i.test(firstLine)) {
    return firstLine;
  }
  if (/UnknownDiagramError|No diagram type detected/i.test(firstLine)) {
    return 'Unrecognized diagram type. Start with flowchart, sequenceDiagram, classDiagram, etc.';
  }
  return firstLine.length > 280 ? `${firstLine.slice(0, 280)}…` : firstLine;
}

/**
 * Lazy-loads Mermaid and renders source into an SVG host.
 * Never throws — errors surface as an inline panel.
 */
function MermaidRendererInner({
  code,
  theme,
  className,
  onSvgReady,
  showLoading = true }: MermaidRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSvgReadyRef = useRef(onSvgReady);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(() => code.trim().length > 0);

  useEffect(() => {
    onSvgReadyRef.current = onSvgReady;
  }, [onSvgReady]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const trimmed = code.trim();
    const runId = ++renderCounter;
    const renderId = `vani-mermaid-${runId}`;

    // All setState lives in the async path so the effect body stays sync-free.
    (async () => {
      if (!trimmed) {
        host.innerHTML = '';
        if (cancelled) return;
        setError(null);
        setIsRendering(false);
        onSvgReadyRef.current?.(null);
        return;
      }

      setIsRendering(true);
      setError(null);

      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        initMermaid(mermaid, theme);

        host.innerHTML = '';

        const { svg, bindFunctions } = await mermaid.render(renderId, trimmed);
        if (cancelled || !hostRef.current) return;

        document.getElementById(renderId)?.remove();
        document.getElementById(`d${renderId}`)?.remove();

        host.innerHTML = svg;
        const svgEl = host.querySelector('svg');
        if (svgEl) {
          svgEl.setAttribute('role', 'img');
          svgEl.setAttribute('aria-label', 'Mermaid diagram');
          svgEl.style.maxWidth = 'none';
          svgEl.style.height = 'auto';
          bindFunctions?.(host);
        }

        setIsRendering(false);
        setError(null);
        onSvgReadyRef.current?.(svgEl);
      } catch (err) {
        document.getElementById(renderId)?.remove();
        document.getElementById(`d${renderId}`)?.remove();
        if (cancelled) return;
        host.innerHTML = '';
        setError(friendlyError(err));
        setIsRendering(false);
        onSvgReadyRef.current?.(null);
      }
    })();

    return () => {
      cancelled = true;
      document.getElementById(renderId)?.remove();
      document.getElementById(`d${renderId}`)?.remove();
    };
  }, [code, theme]);

  return (
    <div className={cn('relative', className)}>
      {showLoading && isRendering && !error && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground"
          aria-live="polite"
          aria-busy="true"
        >
          <Spinner size={18} />
        </div>
      )}

      {error && (
        <div
          className="mx-auto flex max-w-md items-start gap-2.5 rounded-[14px] border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-left"
          role="alert"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Couldn&apos;t render diagram
            </p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-caption leading-relaxed text-red-700/90 dark:text-red-300/90">
              {error}
            </pre>
            <p className="mt-2 text-micro text-muted-foreground">
              Check Mermaid syntax in Code view, then switch back to Preview.
            </p>
          </div>
        </div>
      )}

      {/* Keep the host mounted so recoveries after a parse error can re-render. */}
      <div
        ref={hostRef}
        className={cn(
          'inline-block origin-center [&_svg]:block',
          (isRendering || error) && 'hidden'
        )}
        aria-hidden={!!error || isRendering}
 />
    </div>
  );
}

const MermaidRenderer = memo(MermaidRendererInner);
export default MermaidRenderer;
