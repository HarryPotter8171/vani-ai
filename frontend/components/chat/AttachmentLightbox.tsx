'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Copy,
  Download,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/files';
import { fileContentUrl } from '@/lib/upload';
import type { PendingAttachment } from '@/lib/types';

export interface AttachmentLightboxProps {
  attachment: PendingAttachment | null;
  onClose: () => void;
}

function FileGlyph({ kind }: { kind: PendingAttachment['kind'] }) {
  if (kind === 'pdf') {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-[#FF3B30] text-body font-bold tracking-wide text-white">
        PDF
      </div>
    );
  }
  if (kind === 'docx') {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-[#2B579A] text-title font-bold text-white">
        W
      </div>
    );
  }
  if (kind === 'xlsx' || kind === 'csv') {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-[#217346] text-white">
        <FileSpreadsheet size={28} strokeWidth={1.75} />
      </div>
    );
  }
  if (kind === 'zip') {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-gradient-to-b from-[#FF9F0A] to-[#FF8C00] text-white">
        <FileArchive size={28} strokeWidth={1.75} />
      </div>
    );
  }
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-black/[0.06] text-muted-foreground dark:bg-white/[0.08]">
      <FileText size={28} strokeWidth={1.75} />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'text-muted-foreground/75 hover:bg-black/[0.05] hover:text-foreground',
        'dark:hover:bg-white/[0.08]',
        'transition-all duration-normal ease-out hover:scale-[1.02]'
      )}
    >
      {children}
    </button>
  );
}

/** Strip developer/debug image metadata before showing extracted text. */
function toUserFacingExtractedText(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(/^\s*\[Image[^\]]*\]\s*/gim, '');
  out = out.replace(/Image metadata:\s*(?:\n[ \t]*-[^\n]*)+/gi, '');
  out = out.replace(
    /^\s*-\s*(Format|Dimensions|Size|Has alpha channel|EXIF orientation|Color space):[^\n]*$/gim,
    ''
  );
  out = out.replace(/OCR extracted text:\s*\[none detected\]\s*/gi, '');
  out = out.replace(/OCR extracted text:\s*/gi, '');
  out = out.replace(/\bRaw metadata\b[\s\S]*$/gi, '');
  out = out.replace(/\bTool payload\b[\s\S]*$/gi, '');
  out = out.replace(/\bInternal JSON\b[\s\S]*$/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function ExtractedTextPanel({
  text,
  documentType,
  extractionMethod,
  charCount,
}: {
  text: string;
  documentType?: string;
  extractionMethod?: string;
  charCount?: number;
}) {
  const [copied, setCopied] = useState(false);

  const meta = [
    documentType ? documentType.toUpperCase() : null,
    extractionMethod
      ? extractionMethod === 'ocr'
        ? 'OCR'
        : extractionMethod === 'text+ocr'
          ? 'Text + OCR'
          : 'Text'
      : null,
    typeof charCount === 'number' ? `${charCount.toLocaleString()} chars` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleCopy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be denied — silent fail.
    }
  }, [text]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <p className="text-caption font-semibold tracking-[-0.01em] text-foreground/90">
          Extracted text
        </p>
        <div className="flex min-w-0 items-center gap-2">
          {meta && (
            <p className="truncate text-micro text-muted-foreground/65">{meta}</p>
          )}
          {text ? (
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5',
                'text-micro font-semibold tracking-[-0.01em]',
                'bg-black/[0.04] text-foreground/75 hover:bg-black/[0.07]',
                'dark:bg-white/[0.06] dark:hover:bg-white/[0.1]',
                'transition-colors duration-fast'
              )}
            >
              {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {text ? (
          <pre
            className={cn(
              'whitespace-pre-wrap break-words rounded-sm px-3.5 py-3',
              'bg-black/[0.03] dark:bg-white/[0.04]',
              'text-secondary leading-[1.55] text-foreground/88',
              'font-display'
            )}
          >
            {text}
          </pre>
        ) : (
          <p className="rounded-sm bg-black/[0.03] px-3.5 py-3 text-secondary text-muted-foreground/70 dark:bg-white/[0.04]">
            No text was extracted from this file.
          </p>
        )}
      </div>
    </div>
  );
}

export default function AttachmentLightbox({ attachment, onClose }: AttachmentLightboxProps) {
  return (
    <AnimatePresence>
      {attachment ? (
        <AttachmentLightboxInner
          key={attachment.id}
          attachment={attachment}
          onClose={onClose}
 />
      ) : null}
    </AnimatePresence>
  );
}

function AttachmentLightboxInner({
  attachment,
  onClose,
}: {
  attachment: PendingAttachment;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) {
          setFullscreen(false);
          return;
        }
        onClose();
        return;
      }
      if (attachment.kind !== 'image') return;

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100));
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => {
          const next = Math.max(0.5, Math.round((z - 0.25) * 100) / 100);
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      }
      if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
      // Arrow keys pan when zoomed
      if (zoom > 1) {
        const step = 40;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setPan((p) => ({ ...p, x: p.x + step }));
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setPan((p) => ({ ...p, x: p.x - step }));
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setPan((p) => ({ ...p, y: p.y + step }));
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setPan((p) => ({ ...p, y: p.y - step }));
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [attachment, onClose, fullscreen, zoom, resetView]);

  const rawExtractedText =
    attachment?.extractedText ?? attachment?.understanding?.text ?? '';
  const extractedText = toUserFacingExtractedText(
    typeof rawExtractedText === 'string' ? rawExtractedText : ''
  );
  const hasExtractedText = extractedText.length > 0;
  const documentType = attachment?.documentType ?? attachment?.understanding?.documentType;
  const extractionMethod =
    attachment?.extractionMethod ?? attachment?.understanding?.extractionMethod;
  const charCount =
    attachment?.understanding?.charCount ??
    (extractedText ? extractedText.length : undefined);

  const imageSrc =
    attachment?.kind === 'image'
      ? attachment.previewUrl ||
        (attachment.fileId ? fileContentUrl(attachment.fileId) : undefined)
      : undefined;

  const handleDownload = useCallback(() => {
    if (!attachment) return;
    const href = attachment.fileId
      ? fileContentUrl(attachment.fileId, { download: true })
      : attachment.previewUrl;
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    a.download = attachment.name || 'download';
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [attachment]);

  const handleCopy = useCallback(async () => {
    if (!imageSrc) return;
    try {
      const absolute =
        imageSrc.startsWith('http') || imageSrc.startsWith('data:')
          ? imageSrc
          : `${window.location.origin}${imageSrc}`;
      if (typeof ClipboardItem !== 'undefined' && absolute.startsWith('http')) {
        const res = await fetch(absolute);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || 'image/png']: blob }),
        ]);
      } else {
        await navigator.clipboard.writeText(absolute);
      }
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1600);
    } catch {
      try {
        await navigator.clipboard.writeText(imageSrc);
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 1600);
      } catch {
        /* silent */
      }
    }
  }, [imageSrc]);

  const toggleFullscreen = useCallback(async () => {
    const el = panelRef.current;
    if (!el) {
      setFullscreen((v) => !v);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen((v) => !v);
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragOrigin.current || zoom <= 1) return;
    const dx = e.clientX - dragOrigin.current.x;
    const dy = e.clientY - dragOrigin.current.y;
    setPan({ x: dragOrigin.current.panX + dx, y: dragOrigin.current.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragOrigin.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragOrigin.current = null;
    setDragging(false);
  };

  const bumpZoom = (delta: number) => {
    setZoom((z) => {
      const next = Math.min(4, Math.max(0.5, Math.round((z + delta) * 100) / 100));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={attachment.name}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="absolute inset-0 modal-overlay"
        onClick={onClose}
 />

      <div className="pointer-events-none relative flex h-full w-full items-center justify-center p-4 sm:p-8">
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className={cn(
            'pointer-events-auto relative flex max-h-full w-full flex-col overflow-hidden',
            fullscreen ? 'h-full max-w-none rounded-none' : 'max-h-full',
            !fullscreen &&
              (attachment.kind === 'image' || attachment.kind === 'pdf' || hasExtractedText
                ? 'max-w-[1000px]'
                : 'max-w-[420px]'),
            !fullscreen && 'rounded-[22px]',
            'bg-white/96 dark:bg-[#161618]/96',
            'backdrop-blur-2xl backdrop-saturate-[1.6]',
            'border border-[var(--border)]',
            'shadow-3'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06] sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tracking-[-0.015em] text-foreground">
                {attachment.name}
              </p>
              <p className="truncate text-micro text-muted-foreground/70">
                {formatFileSize(attachment.size)}
                {attachment.mimeType ? ` · ${attachment.mimeType}` : ''}
                {documentType ? ` · ${documentType}` : ''}
              </p>
            </div>

            {attachment.kind === 'image' && imageSrc && (
              <>
                <ToolbarButton label="Zoom out" onClick={() => bumpZoom(-0.25)}>
                  <ZoomOut size={15} strokeWidth={2} />
                </ToolbarButton>
                <button
                  type="button"
                  onClick={resetView}
                  className="w-10 text-center text-micro font-medium tabular-nums text-muted-foreground/70 transition-colors duration-fast hover:text-foreground"
                  title="Reset zoom"
                  aria-label="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <ToolbarButton label="Zoom in" onClick={() => bumpZoom(0.25)}>
                  <ZoomIn size={15} strokeWidth={2} />
                </ToolbarButton>
                <ToolbarButton
                  label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  onClick={() => void toggleFullscreen()}
                >
                  {fullscreen ? (
                    <Minimize2 size={15} strokeWidth={2} />
                  ) : (
                    <Maximize2 size={15} strokeWidth={2} />
                  )}
                </ToolbarButton>
              </>
            )}

            {(attachment.fileId || attachment.previewUrl) && (
              <ToolbarButton label="Download" onClick={handleDownload}>
                <Download size={15} strokeWidth={2} />
              </ToolbarButton>
            )}

            {attachment.kind === 'image' && imageSrc && (
              <ToolbarButton label={copiedLink ? 'Copied' : 'Copy image'} onClick={() => void handleCopy()}>
                {copiedLink ? (
                  <Check size={15} strokeWidth={2} />
                ) : (
                  <Copy size={15} strokeWidth={2} />
                )}
              </ToolbarButton>
            )}

            <ToolbarButton label="Close preview" onClick={onClose}>
              <X size={16} strokeWidth={2} />
            </ToolbarButton>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {attachment.kind === 'image' && imageSrc ? (
              <div
                className={cn(
                  'flex items-center justify-center overflow-hidden bg-black/[0.04] p-4 dark:bg-black/40 sm:p-6',
                  fullscreen ? 'min-h-0 flex-1' : 'max-h-[min(72vh,720px)]',
                  zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => {
                  if (zoom > 1) resetView();
                  else setZoom(2);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt={attachment.name}
                  className="img-fade-in max-h-full max-w-full select-none rounded-sm object-contain shadow-[0_8px_32px_rgba(0,0,0,0.18)] transition-transform duration-fast ease-out"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    maxHeight: fullscreen ? '100%' : 'min(72vh, 720px)',
                  }}
                  draggable={false}
 />
              </div>
            ) : attachment.kind === 'pdf' && (attachment.previewUrl || attachment.fileId) ? (
              <div
                className={cn(
                  'relative flex w-full shrink-0 flex-col',
                  fullscreen ? 'min-h-0 flex-1' : 'h-[min(62vh,640px)]',
                  'bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.02))]',
                  'dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.45),rgba(0,0,0,0.28))]'
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#FF3B30] text-micro font-bold text-white">
                      PDF
                    </span>
                    <p className="text-micro font-medium text-text-secondary">
                      Document preview
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <ToolbarButton
                      label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                      onClick={() => void toggleFullscreen()}
                    >
                      {fullscreen ? (
                        <Minimize2 size={15} strokeWidth={2} />
                      ) : (
                        <Maximize2 size={15} strokeWidth={2} />
                      )}
                    </ToolbarButton>
                    <a
                      href={
                        attachment.fileId
                          ? fileContentUrl(attachment.fileId)
                          : attachment.previewUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex h-9 items-center gap-1.5 rounded-full px-3',
                        'text-micro font-semibold text-accent',
                        'hover:bg-accent-muted transition-colors duration-fast'
                      )}
                    >
                      Open
                    </a>
                  </div>
                </div>
                <iframe
                  title={attachment.name}
                  src={`${
                    attachment.previewUrl ||
                    (attachment.fileId ? fileContentUrl(attachment.fileId) : '')
                  }#view=FitH`}
                  className="min-h-0 flex-1 w-full border-0 bg-white dark:bg-[#1c1c1e]"
 />
              </div>
            ) : !hasExtractedText ? (
              <div className="flex flex-col items-center gap-4 px-8 py-12 text-center">
                <FileGlyph kind={attachment.kind} />
                <div>
                  <p className="text-secondary font-medium tracking-[-0.015em] text-foreground">
                    {attachment.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground/70">
                    Preview isn’t available for this file type.
                  </p>
                </div>
              </div>
            ) : null}

            {hasExtractedText && (
              <ExtractedTextPanel
                text={extractedText}
                documentType={documentType}
                extractionMethod={extractionMethod}
                charCount={charCount}
 />
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
