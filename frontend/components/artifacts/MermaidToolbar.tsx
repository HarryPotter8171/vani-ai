'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Scan,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MermaidToolbarProps {
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isFullscreen: boolean;
  hasSvg: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onToggleFullscreen: () => void;
  onCopyCode: () => Promise<boolean> | boolean;
  onDownloadSvg: () => void;
  onDownloadPng: () => void | Promise<void>;
  className?: string;
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-foreground/70 hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Floating chrome for Mermaid preview: zoom, fit, fullscreen, copy, export.
 */
export default function MermaidToolbar({
  zoomPercent,
  canZoomIn,
  canZoomOut,
  isFullscreen,
  hasSvg,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleFullscreen,
  onCopyCode,
  onDownloadSvg,
  onDownloadPng,
  className,
}: MermaidToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  const handleCopy = async () => {
    const ok = await onCopyCode();
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handlePng = async () => {
    setExportBusy(true);
    try {
      await onDownloadPng();
    } finally {
      setExportBusy(false);
      setExportOpen(false);
    }
  };

  return (
    <div
      className={cn(
        'pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5',
        'rounded-full px-1.5 py-1',
        'bg-surface',
        'backdrop-blur-xl',
        'ring-1 ring-black/[0.06] dark:ring-white/[0.1]',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.10)]',
        className
      )}
      role="toolbar"
      aria-label="Diagram controls"
    >
      <ToolButton label="Zoom out" onClick={onZoomOut} disabled={!canZoomOut || !hasSvg}>
        <ZoomOut size={14} strokeWidth={2} />
      </ToolButton>

      <span
        className="min-w-[3.25rem] select-none px-1 text-center text-micro font-medium tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {zoomPercent}%
      </span>

      <ToolButton label="Zoom in" onClick={onZoomIn} disabled={!canZoomIn || !hasSvg}>
        <ZoomIn size={14} strokeWidth={2} />
      </ToolButton>

      <div className="mx-0.5 h-4 w-px bg-black/[0.08] dark:bg-white/[0.12]" />

      <ToolButton label="Fit to screen" onClick={onFit} disabled={!hasSvg}>
        <Scan size={14} strokeWidth={2} />
      </ToolButton>

      <ToolButton
        label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={onToggleFullscreen}
        active={isFullscreen}
      >
        {isFullscreen ? (
          <Minimize2 size={13.5} strokeWidth={2} />
        ) : (
          <Maximize2 size={13.5} strokeWidth={2} />
        )}
      </ToolButton>

      <div className="mx-0.5 h-4 w-px bg-black/[0.08] dark:bg-white/[0.12]" />

      <ToolButton label={copied ? 'Copied' : 'Copy Mermaid code'} onClick={handleCopy}>
        {copied ? (
          <Check size={14} strokeWidth={2.25} className="text-emerald-500" />
        ) : (
          <Copy size={13.5} strokeWidth={2} />
        )}
      </ToolButton>

      <div className="relative" ref={menuRef}>
        <ToolButton
          label="Export diagram"
          onClick={() => setExportOpen((v) => !v)}
          disabled={!hasSvg || exportBusy}
          active={exportOpen}
        >
          <Download size={13.5} strokeWidth={2} />
        </ToolButton>

        {exportOpen && (
          <div
            className={cn(
              'absolute bottom-[calc(100%+8px)] right-0 z-30 min-w-[168px] overflow-hidden rounded-[12px]',
              'bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl',
              'ring-1 ring-black/[0.08] dark:ring-white/[0.1]',
              'shadow-[0_8px_32px_rgba(0,0,0,0.12)]'
            )}
            role="menu"
            aria-label="Export options"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground/90 hover:bg-surface-hover"
              onClick={() => {
                onDownloadSvg();
                setExportOpen(false);
              }}
            >
              <Download size={13} strokeWidth={2} className="text-muted-foreground" />
              Download SVG
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground/90 hover:bg-surface-hover"
              onClick={handlePng}
            >
              <Download size={13} strokeWidth={2} className="text-muted-foreground" />
              Download PNG
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 border-t border-black/[0.06] px-3 py-2 text-left text-sm text-foreground/90 hover:bg-black/[0.04] dark:border-white/[0.08] dark:hover:bg-white/[0.06]"
              onClick={handleCopy}
            >
              <Code2 size={13} strokeWidth={2} className="text-muted-foreground" />
              Copy Mermaid code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
