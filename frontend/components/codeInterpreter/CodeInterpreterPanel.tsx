'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileUp, Play, RotateCcw, Square, TerminalSquare, Trash2, X, ImageIcon, PanelsTopLeft } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { FilePicker } from '@/components/ui/Input';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { cn } from '@/lib/utils';
import type { CodeSession, GeneratedFile, PlotArtifact } from '@/lib/codeInterpreter';
import CodeEditor from './CodeEditor';

export interface CodeInterpreterPanelProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  session: CodeSession | null;
  code: string;
  onCodeChange: (code: string) => void;
  stdout: string;
  stderr: string;
  error: string | null;
  isRunning: boolean;
  isStarting?: boolean;
  uploadProgress?: number | null;
  files: GeneratedFile[];
  plots: PlotArtifact[];
  fileUrl: (fileId: string) => string | null;
  onRun: () => void;
  onInterrupt: () => void;
  onRestart: () => void;
  onUpload: (file: File) => void;
  onPublishCanvas?: () => void;
  onCloseSession?: () => void;
  className?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: CodeSession['status'] | undefined, running: boolean): string {
  if (running) return 'Running';
  switch (status) {
    case 'starting':
      return 'Starting kernel';
    case 'ready':
      return 'Ready';
    case 'interrupted':
      return 'Interrupted';
    case 'error':
      return 'Error';
    default:
      return 'Code Interpreter';
  }
}

export default function CodeInterpreterPanel({
  open = true,
  onOpenChange,
  session,
  code,
  onCodeChange,
  stdout,
  stderr,
  error,
  isRunning,
  isStarting,
  uploadProgress,
  files,
  plots,
  fileUrl,
  onRun,
  onInterrupt,
  onRestart,
  onUpload,
  onPublishCanvas,
  onCloseSession,
  className }: CodeInterpreterPanelProps) {
  const [tab, setTab] = useState<'output' | 'files' | 'charts'>('output');

  if (!open) return null;

  const busy = isRunning || Boolean(isStarting);

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={cn(
          'flex h-full min-h-0 w-full flex-col md:w-[460px] lg:w-[520px]',
          'border-l border-border',
          'bg-surface-glass',
          'backdrop-blur-2xl backdrop-saturate-[1.6]',
          'shadow-[-12px_0_40px_rgba(0,0,0,0.04)] dark:shadow-[-16px_0_48px_rgba(0,0,0,0.35)]',
          className
        )}
      >
        <header className="flex items-center gap-2 border-b border-black/[0.04] px-3 py-2.5 dark:border-white/[0.05]">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-muted text-accent">
            <TerminalSquare size={15} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-[-0.02em]">
              Code Interpreter
            </p>
            <p className="truncate text-micro text-muted-foreground/75">
              {statusLabel(session?.status, isRunning)}
              {session?.executionCount
                ? ` · ${session.executionCount} run${session.executionCount === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onRestart}
            disabled={busy && !session}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            title="Restart kernel"
            aria-label="Restart kernel"
          >
            <RotateCcw size={14} />
          </button>
          {onCloseSession && (
            <button
              type="button"
              onClick={onCloseSession}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              title="Close session"
              aria-label="Close session"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Close panel"
          >
            <X size={15} />
          </button>
        </header>

        {(busy || uploadProgress != null) && (
          <div className="h-0.5 w-full overflow-hidden bg-surface-hover">
            <motion.div
              className="h-full bg-accent"
              initial={{ width: '8%' }}
              animate={{
                width:
                  uploadProgress != null
                    ? `${Math.max(8, uploadProgress)}%`
                    : ['12%', '70%', '40%', '85%'] }}
              transition={
                uploadProgress != null
                  ? { duration: 0.2 }
                  : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
              }
 />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <CodeEditor
            value={code}
            onChange={onCodeChange}
            onRun={onRun}
            disabled={isRunning}
            className="min-h-[200px] max-h-[42%]"
 />

          <div className="flex items-center gap-1.5">
            {isRunning ? (
              <Button
                type="button"
                size="sm"
                onClick={onInterrupt}
                leftIcon={<Square size={12} fill="currentColor" />}
                className="bg-red-500/90 text-white shadow-none hover:bg-red-500 hover:shadow-none"
              >
                Stop
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onRun}
                disabled={isStarting}
                loading={isStarting}
                leftIcon={isStarting ? undefined : <Play size={13} fill="currentColor" />}
                className="shadow-none hover:shadow-none disabled:opacity-60"
              >
                Run
              </Button>
            )}

            <FilePicker
              disabled={busy}
              onFiles={(files) => {
                const file = files[0];
                if (file) onUpload(file);
              }}
              buttonProps={{
                variant: 'ghost',
                size: 'sm',
                leftIcon: <FileUp size={13} />,
                className:
                  'px-2.5 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
              }}
            >
              Upload
            </FilePicker>

            {onPublishCanvas && plots.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onPublishCanvas}
                leftIcon={<PanelsTopLeft size={13} />}
                className="px-2.5 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                title="Publish chart to Canvas"
              >
                Canvas
              </Button>
            )}

            <span className="ml-auto text-micro text-muted-foreground/70">
              ⌘/Ctrl+Enter
            </span>
          </div>

          <div className="flex gap-1 rounded-lg bg-black/[0.03] p-0.5 dark:bg-white/[0.04]">
            {(
              [
                ['output', 'Output'],
                ['charts', `Charts${plots.length ? ` (${plots.length})` : ''}`],
                ['files', `Files${files.length ? ` (${files.length})` : ''}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 text-micro font-medium transition-colors',
                  tab === id
                    ? 'bg-surface text-foreground shadow-token-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-xl bg-black/[0.03] p-3 dark:bg-black/30">
            {tab === 'output' && (
              <div className="space-y-2 font-mono text-caption leading-relaxed">
                {error && (
                  <pre className="whitespace-pre-wrap text-red-500 dark:text-red-400">{error}</pre>
                )}
                {stderr && (
                  <pre className="whitespace-pre-wrap text-amber-600 dark:text-amber-400">
                    {stderr}
                  </pre>
                )}
                {stdout ? (
                  <pre className="whitespace-pre-wrap text-foreground/90">{stdout}</pre>
                ) : (
                  !error &&
                  !stderr && (
                    <PremiumEmpty
                      size="sm"
                      icon={TerminalSquare}
                      title="No output yet"
                      description="Run code to see stdout, results, and errors here."
                      className="py-6 font-sans"
                    />
                  )
                )}
                {isRunning && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Spinner size={12} />
                    Executing…
                  </div>
                )}
              </div>
            )}

            {tab === 'charts' && (
              <div className="grid grid-cols-1 gap-3">
                {plots.length === 0 ? (
                  <PremiumEmpty
                    size="sm"
                    icon={ImageIcon}
                    title="No charts yet"
                    description="Charts from plt.show() appear here."
                    className="py-6 font-sans"
                  />
                ) : (
                  plots.map((plot) => {
                    const src = fileUrl(plot.fileId);
                    return (
                      <div key={plot.id} className="overflow-hidden rounded-lg bg-white/60 dark:bg-white/[0.04]">
                        {src ? (
                          // Auth'd sandbox plot URLs — not a static asset CDN path.
                          // eslint-disable-next-line @next/next/no-img-element -- dynamic signed API image
                          <img
                            src={src}
                            alt={plot.path}
                            className="max-h-64 w-full object-contain"
 />
                        ) : null}
                        <div className="flex items-center justify-between px-2 py-1.5 text-micro text-muted-foreground">
                          <span className="truncate">{plot.path}</span>
                          {src && (
                            <a
                              href={src}
                              download
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              <Download size={12} />
                              Save
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'files' && (
              <div className="space-y-1.5">
                {files.length === 0 ? (
                  <PremiumEmpty
                    size="sm"
                    icon={FileUp}
                    title="No files yet"
                    description="Uploaded and generated files will list here."
                    className="py-6 font-sans"
                  />
                ) : (
                  files.map((file) => {
                    const href = fileUrl(file.id);
                    return (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-caption font-medium">{file.name}</p>
                          <p className="truncate text-micro text-muted-foreground">
                            {file.kind} · {formatBytes(file.size)} · {file.path}
                          </p>
                        </div>
                        {href && (
                          <a
                            href={href}
                            download={file.name}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                            title="Download"
                          >
                            <Download size={13} />
                          </a>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
