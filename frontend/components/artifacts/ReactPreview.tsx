'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Eraser, Terminal, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  buildReactBootstrapDocument,
  IFRAME_SANDBOX,
  isReactPreviewMessage,
  PREVIEW_VIEWPORT_WIDTHS,
  prepareReactSource,
  REACT_PREVIEW_CHANNEL,
  type PreviewViewport,
  type ReactConsoleLevel,
  type ReactPreviewMessage } from '@/lib/artifactPreview';
import ErrorBoundary from '@/components/artifacts/ErrorBoundary';

const DEFAULT_DEBOUNCE_MS = 320;
const MAX_CONSOLE_ENTRIES = 200;

export interface ReactPreviewProps {
  /** Raw JSX / TSX source (imports allowed — stripped at prepare time). */
  code: string;
  /** Enable TypeScript preset when language is tsx. */
  typescript?: boolean;
  title?: string;
  className?: string;
  viewport?: PreviewViewport;
  debounceMs?: number;
  /** Hard remount of the bootstrap iframe (CDN engines reload). */
  refreshKey?: number;
  /** Show / hide the collapsible console drawer. Default true. */
  showConsole?: boolean;
}

interface ConsoleEntry {
  id: number;
  level: ReactConsoleLevel;
  args: unknown[];
  at: number;
}

interface RuntimeErrorState {
  message: string;
  stack?: string;
  detail?: string;
  kind: 'compile' | 'runtime';
}

let consoleSeq = 0;

function formatArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return String(value);
  try {
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    return String(value);
  }
}

function levelStyles(level: ReactConsoleLevel): string {
  switch (level) {
    case 'error':
      return 'text-red-400';
    case 'warn':
      return 'text-amber-300';
    case 'info':
      return 'text-sky-300';
    case 'debug':
      return 'text-white/40';
    default:
      return 'text-white/80';
  }
}

function RuntimeErrorOverlay({
  error,
  onDismiss }: {
  error: RuntimeErrorState;
  onDismiss: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 top-0 z-20 m-3 overflow-hidden rounded-[12px] border border-red-500/30 bg-[#1a0b0b]/95 shadow-lg backdrop-blur-md"
      role="alert"
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <div className="text-caption font-semibold tracking-wide text-red-300">
            {error.kind === 'compile' ? 'Compile error' : 'Runtime error'}
          </div>
          <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-micro leading-relaxed text-red-100/90">
            {error.stack || error.message}
            {error.detail ? `\n${error.detail}` : ''}
          </pre>
        </div>
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-red-200/70 transition-colors hover:bg-white/10 hover:text-red-100"
        >
          <X size={13} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

function ConsolePanel({
  entries,
  open,
  onToggle,
  onClear }: {
  entries: ConsoleEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warnCount = entries.filter((e) => e.level === 'warn').length;

  return (
    <div className="shrink-0 border-t border-black/[0.08] bg-[#121214] dark:border-white/[0.08]">
      <div className="flex h-8 items-center justify-between px-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-micro font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-expanded={open}
        >
          <Terminal size={12.5} strokeWidth={2.25} />
          Console
          {entries.length > 0 && (
            <span className="rounded-full bg-white/10 px-1.5 text-micro tabular-nums text-white/60">
              {entries.length}
            </span>
          )}
          {errorCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-1.5 text-micro tabular-nums text-red-300">
              {errorCount} err
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 text-micro tabular-nums text-amber-200">
              {warnCount} warn
            </span>
          )}
          {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          aria-label="Clear console"
          title="Clear console"
          className="flex h-6 w-6 items-center justify-center rounded-[6px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-30"
        >
          <Eraser size={12.5} strokeWidth={2} />
        </button>
      </div>
      {open && (
        <div className="custom-scrollbar max-h-36 overflow-auto border-t border-white/[0.06] px-3 py-2 font-mono text-micro leading-[1.55]">
          {entries.length === 0 ? (
            <div className="py-2 text-white/30">No console output yet.</div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className={cn('whitespace-pre-wrap break-words', levelStyles(entry.level))}
              >
                <span className="mr-2 select-none text-white/25">{entry.level}</span>
                {entry.args.map(formatArg).join(' ')}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface PreviewUiState {
  generation: number;
  error: RuntimeErrorState | null;
  consoleEntries: ConsoleEntry[];
}

/**
 * Production React live preview:
 * - Sandboxed iframe (no same-origin / popups / top-nav)
 * - Bootstrap loads React 18 + Babel + Tailwind once
 * - Fast Refresh–style code swaps via postMessage (no CDN reload)
 * - Host ErrorBoundary + iframe runtime error overlay
 * - Console output panel bridged from the iframe
 */
function ReactPreviewInner({
  code,
  typescript = false,
  title = 'React preview',
  className,
  viewport = 'desktop',
  debounceMs = DEFAULT_DEBOUNCE_MS,
  refreshKey = 0,
  showConsole = true }: ReactPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const revisionRef = useRef(0);
  const pendingCodeRef = useRef<string | null>(null);
  const latestCodeRef = useRef('');
  const refreshKeyRef = useRef(refreshKey);

  const [readyGeneration, setReadyGeneration] = useState<number | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [ui, setUi] = useState<PreviewUiState>({
    generation: refreshKey,
    error: null,
    consoleEntries: [] });

  const bootstrapSrcDoc = useMemo(() => buildReactBootstrapDocument(), []);
  const prepared = useMemo(() => prepareReactSource(code), [code]);
  const debouncedCode = useDebouncedValue(prepared, debounceMs);
  const isPending = prepared !== debouncedCode;
  const runtimeReady = readyGeneration === refreshKey;

  // Reset overlay/console when the iframe session remounts (render-time adjust).
  if (ui.generation !== refreshKey) {
    setUi({ generation: refreshKey, error: null, consoleEntries: [] });
  }

  useEffect(() => {
    latestCodeRef.current = debouncedCode;
    refreshKeyRef.current = refreshKey;
  }, [debouncedCode, refreshKey]);

  const frameWidth = PREVIEW_VIEWPORT_WIDTHS[viewport];
  const isFramed = viewport !== 'desktop';
  const frameStyle = useMemo(
    () =>
      isFramed
        ? {
            width: typeof frameWidth === 'number' ? `${frameWidth}px` : frameWidth,
            maxWidth: '100%' }
        : undefined,
    [frameWidth, isFramed]
  );

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      if (!isReactPreviewMessage(event.data)) return;

      const data = event.data;
      switch (data.type) {
        case 'ready': {
          setReadyGeneration(refreshKeyRef.current);
          const pending = pendingCodeRef.current ?? latestCodeRef.current;
          pendingCodeRef.current = null;
          // Defer execute until readyGeneration state commits via the code effect.
          pendingCodeRef.current = pending;
          break;
        }
        case 'console': {
          const level = (data.level ?? 'log') as ReactConsoleLevel;
          const args = Array.isArray(data.args) ? data.args : [data.message ?? ''];
          setUi((prev) => {
            const nextEntries: ConsoleEntry[] = [
              ...prev.consoleEntries,
              { id: ++consoleSeq, level, args, at: Date.now() },
            ];
            return {
              ...prev,
              consoleEntries:
                nextEntries.length > MAX_CONSOLE_ENTRIES
                  ? nextEntries.slice(nextEntries.length - MAX_CONSOLE_ENTRIES)
                  : nextEntries };
          });
          if (level === 'error') setConsoleOpen(true);
          break;
        }
        case 'compile-error':
          setIsCompiling(false);
          setUi((prev) => ({
            ...prev,
            error: {
              kind: 'compile',
              message: data.message || 'Compile error',
              stack: data.stack } }));
          break;
        case 'runtime-error':
          setIsCompiling(false);
          setUi((prev) => {
            const nextEntries: ConsoleEntry[] = [
              ...prev.consoleEntries,
              {
                id: ++consoleSeq,
                level: 'error',
                args: [data.stack || data.message || 'Runtime error'],
                at: Date.now() },
            ];
            return {
              ...prev,
              error: {
                kind: 'runtime',
                message: data.message || 'Runtime error',
                stack: data.stack,
                detail: data.detail },
              consoleEntries:
                nextEntries.length > MAX_CONSOLE_ENTRIES
                  ? nextEntries.slice(nextEntries.length - MAX_CONSOLE_ENTRIES)
                  : nextEntries };
          });
          break;
        case 'render-ok':
          setIsCompiling(false);
          setUi((prev) => ({ ...prev, error: null }));
          break;
        case 'status':
          setIsCompiling(data.message === 'compiling');
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Fast Refresh–style: push debounced source into the warm runtime.
  useEffect(() => {
    if (!runtimeReady) {
      pendingCodeRef.current = debouncedCode;
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const source = pendingCodeRef.current ?? debouncedCode;
    pendingCodeRef.current = null;

    revisionRef.current += 1;
    setIsCompiling(true);
    setUi((prev) => ({ ...prev, error: null }));
    iframe.contentWindow.postMessage(
      {
        channel: REACT_PREVIEW_CHANNEL,
        type: 'execute',
        code: source,
        typescript,
        revision: revisionRef.current } satisfies ReactPreviewMessage,
      '*'
    );
  }, [debouncedCode, runtimeReady, typescript]);

  const handleClearConsole = useCallback(() => {
    setUi((prev) => ({ ...prev, consoleEntries: [] }));
  }, []);

  let chrome: ReactNode = null;
  if (!runtimeReady || isPending || isCompiling) {
    chrome = (
      <div
        className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-micro font-medium tracking-wide text-white backdrop-blur-sm"
        aria-live="polite"
      >
        <Spinner size={11} />
        {!runtimeReady ? 'Loading runtime…' : isPending ? 'Updating…' : 'Compiling…'}
      </div>
    );
  }

  return (
    <ErrorBoundary title="React preview crashed" className={className}>
      <div className={cn('relative flex h-full min-h-0 w-full flex-col', className)}>
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col',
            isFramed && 'items-center bg-[#ececf0] dark:bg-[#141416]'
          )}
        >
          {chrome}
          {ui.error && (
            <RuntimeErrorOverlay
              error={ui.error}
              onDismiss={() => setUi((prev) => ({ ...prev, error: null }))}
 />
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
                srcDoc={bootstrapSrcDoc}
                sandbox={IFRAME_SANDBOX}
                referrerPolicy="no-referrer"
                className="h-full w-full border-0 bg-white"
 />
            </div>
          </div>
        </div>

        {showConsole && (
          <ConsolePanel
            entries={ui.consoleEntries}
            open={consoleOpen}
            onToggle={() => setConsoleOpen((v) => !v)}
            onClear={handleClearConsole}
 />
        )}
      </div>
    </ErrorBoundary>
  );
}

const ReactPreview = memo(ReactPreviewInner);
export default ReactPreview;
