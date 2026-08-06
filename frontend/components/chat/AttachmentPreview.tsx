'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, FileSpreadsheet, FileArchive, RotateCcw, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/files';
import type { PendingAttachment } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';

const EASE = [0.23, 1, 0.32, 1] as const;

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FF3B30" />
      <path
        d="M9 22V10h5.2c1.9 0 3.15 1.15 3.15 2.85 0 1.2-.7 2.2-1.85 2.55L18.6 22h-2.35l-2.85-5.7H11.2V22H9zm2.2-7.55h2.7c.85 0 1.4-.5 1.4-1.25s-.55-1.2-1.4-1.2h-2.7v2.45z"
        fill="white"
 />
    </svg>
  );
}

function WordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2B579A" />
      <path
        d="M8.5 22L11.2 10h2.55l1.85 7.4L17.5 10H20l2.7 12h-2.45l-1.55-7.55L16.2 22h-2.3l-1.55-7.55L10.85 22H8.5z"
        fill="white"
 />
    </svg>
  );
}

function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#217346" />
      <path
        d="M10.2 10h2.7l2.15 4.35L17.2 10h2.65l-3.55 6 3.7 6H17.2l-2.25-4.5L12.7 22H10l3.7-6-3.5-6z"
        fill="white"
 />
    </svg>
  );
}

function ZipIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center rounded-[8px]',
        'bg-gradient-to-b from-[#FF9F0A] to-[#FF8C00]',
        className
      )}
    >
      <FileArchive size={16} strokeWidth={2} className="text-white" />
    </div>
  );
}

function FileTypeIcon({ attachment }: { attachment: PendingAttachment }) {
  const shell = 'h-9 w-9 shrink-0 overflow-hidden rounded-[10px]';

  if (attachment.kind === 'pdf') return <PdfIcon className={shell} />;
  if (attachment.kind === 'docx') return <WordIcon className={shell} />;
  if (attachment.kind === 'xlsx' || attachment.kind === 'csv') {
    return attachment.kind === 'csv' ? (
      <div className={cn(shell, 'flex items-center justify-center bg-emerald-600/90 text-white')}>
        <FileSpreadsheet size={16} strokeWidth={2} />
      </div>
    ) : (
      <ExcelIcon className={shell} />
    );
  }
  if (attachment.kind === 'zip') return <ZipIcon className={shell} />;

  return (
    <div
      className={cn(
        shell,
        'flex items-center justify-center',
        'bg-black/[0.06] text-muted-foreground dark:bg-white/[0.08]'
      )}
    >
      <FileText size={16} strokeWidth={1.75} />
    </div>
  );
}

function ProgressBar({
  progress,
  tone = 'primary' }: {
  progress: number;
  tone?: 'primary' | 'light';
}) {
  return (
    <div
      className={cn(
        'h-[2.5px] w-full overflow-hidden rounded-full',
        tone === 'light' ? 'bg-white/25' : 'bg-surface-hover'
      )}
    >
      <motion.div
        className={cn(
          'h-full rounded-full',
          tone === 'light' ? 'bg-white' : 'bg-primary'
        )}
        initial={false}
        animate={{ width: `${Math.max(4, progress)}%` }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
 />
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
  danger }: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full',
        'backdrop-blur-sm transition-colors duration-150',
        danger
          ? 'bg-black/55 text-white hover:bg-black/70'
          : 'bg-black/[0.08] text-foreground/70 hover:bg-black/[0.14] hover:text-foreground dark:bg-white/[0.1] dark:hover:bg-white/[0.16]'
      )}
    >
      {children}
    </button>
  );
}

function ImagePreviewCard({
  attachment,
  isReading,
  isAnalyzing,
  isError,
  onRemove,
  onCancel,
  onRetry,
  onPreview,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragTarget }: {
  attachment: PendingAttachment;
  isReading: boolean;
  isAnalyzing: boolean;
  isError: boolean;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPreview: (attachment: PendingAttachment) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
  isDragTarget: boolean;
}) {
  const isBusy = isReading || isAnalyzing;
  const canPreview = !!attachment.previewUrl && !isBusy;

  return (
    <div
      draggable={!isBusy}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', attachment.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(attachment.id);
      }}
      onDragOver={(e) => onDragOver(e, attachment.id)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(attachment.id);
      }}
      onDragEnd={onDragEnd}
    >
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 4 }}
      transition={{ duration: 0.24, ease: EASE }}
      className={cn(
        'group relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[16px]',
        'ring-1 ring-black/[0.06] dark:ring-white/[0.08]',
        'bg-black/[0.035] dark:bg-white/[0.055]',
        isError && 'ring-red-500/35',
        canPreview && 'cursor-pointer',
        !isBusy && 'cursor-grab active:cursor-grabbing',
        isDragTarget && 'ring-2 ring-primary/50'
      )}
      onClick={() => {
        if (canPreview) onPreview(attachment);
      }}
      role={canPreview ? 'button' : undefined}
      tabIndex={canPreview ? 0 : undefined}
      onKeyDown={(e) => {
        if (canPreview && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onPreview(attachment);
        }
      }}
    >
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          loading="lazy"
          decoding="async"
          className={cn(
            'h-full w-full object-cover transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
            canPreview && 'group-hover:scale-[1.04]'
          )}
 />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-micro text-muted-foreground">
          Image
        </div>
      )}

      {(isReading || isAnalyzing) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 backdrop-blur-[2px]"
        >
          <Spinner size={16} tone="inverse" label="Processing" />
          <span className="text-micro font-medium text-white/90">
            {isAnalyzing ? 'Analyzing…' : `${attachment.progress}%`}
          </span>
          {!isAnalyzing && (
            <div className="absolute inset-x-2 bottom-2">
              <ProgressBar progress={attachment.progress} tone="light" />
            </div>
          )}
        </motion.div>
      )}

      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-red-950/55 px-1.5 backdrop-blur-[1px]">
          <span className="text-micro font-medium text-red-100">Failed</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(attachment.id);
            }}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5',
              'bg-white/90 text-micro font-semibold text-red-600',
              'hover:bg-white transition-colors'
            )}
          >
            <RotateCcw size={10} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      )}

      {canPreview && !isError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 group-hover:bg-black/25 group-hover:opacity-100">
          <Eye size={16} className="text-white drop-shadow" strokeWidth={2} />
        </div>
      )}

      <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
        <ActionButton
          label={isBusy ? `Cancel ${attachment.name}` : `Remove ${attachment.name}`}
          danger
          onClick={(e) => {
            e.stopPropagation();
            if (isBusy) onCancel(attachment.id);
            else onRemove(attachment.id);
          }}
        >
        <X size={11} strokeWidth={2.5} />
      </ActionButton>
      </div>
    </motion.div>
    </div>
  );
}

function PdfPreviewCard({
  attachment,
  isReading,
  isAnalyzing,
  isError,
  onRemove,
  onCancel,
  onRetry,
  onPreview }: {
  attachment: PendingAttachment;
  isReading: boolean;
  isAnalyzing: boolean;
  isError: boolean;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPreview: (attachment: PendingAttachment) => void;
}) {
  const isBusy = isReading || isAnalyzing;
  const canPreview = !!attachment.previewUrl && !isBusy && !isError;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 4 }}
      transition={{ duration: 0.24, ease: EASE }}
      className={cn(
        'group relative flex h-[88px] w-[120px] shrink-0 flex-col overflow-hidden rounded-[16px]',
        'ring-1 ring-black/[0.06] dark:ring-white/[0.08]',
        'bg-gradient-to-b from-[#FFF5F4] to-[#FFE8E6] dark:from-[#3a1a18] dark:to-[#2a1210]',
        isError && 'ring-red-500/35',
        canPreview && 'cursor-pointer'
      )}
      onClick={() => {
        if (canPreview) onPreview(attachment);
      }}
      role={canPreview ? 'button' : undefined}
      tabIndex={canPreview ? 0 : undefined}
      onKeyDown={(e) => {
        if (canPreview && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onPreview(attachment);
        }
      }}
    >
      <div className="relative flex flex-1 items-center justify-center pt-2">
        <PdfIcon className="h-10 w-10 drop-shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105" />
        {isBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 backdrop-blur-[1px]">
            <Spinner size={16} tone="inverse" label="Processing" />
            {isAnalyzing && (
              <span className="text-micro font-medium text-white/90">Analyzing…</span>
            )}
          </div>
        )}
      </div>

      <div className="px-2 pb-2 pt-1">
        <p className="truncate text-micro font-medium tracking-[-0.01em] text-foreground/90">
          {attachment.name}
        </p>
        <p
          className={cn(
            'truncate text-micro',
            isError ? 'text-red-500' : 'text-muted-foreground/70'
          )}
        >
          {isError
            ? 'Failed'
            : isAnalyzing
              ? 'Analyzing…'
              : isReading
                ? `${attachment.progress}%`
                : formatFileSize(attachment.size)}
        </p>
        {isReading && !isAnalyzing && (
          <div className="mt-1">
            <ProgressBar progress={attachment.progress} />
          </div>
        )}
      </div>

      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-red-950/50 backdrop-blur-[1px]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(attachment.id);
            }}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5',
              'bg-white/90 text-micro font-semibold text-red-600',
              'hover:bg-white transition-colors'
            )}
          >
            <RotateCcw size={10} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      )}

      {canPreview && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 group-hover:bg-black/20 group-hover:opacity-100">
          <Eye size={16} className="text-white drop-shadow" strokeWidth={2} />
        </div>
      )}

      <div className="absolute right-1.5 top-1.5 z-10">
        <ActionButton
          label={isBusy ? `Cancel ${attachment.name}` : `Remove ${attachment.name}`}
          danger
          onClick={(e) => {
            e.stopPropagation();
            if (isBusy) onCancel(attachment.id);
            else onRemove(attachment.id);
          }}
        >
          <X size={11} strokeWidth={2.5} />
        </ActionButton>
      </div>
    </motion.div>
  );
}

export interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPreview: (attachment: PendingAttachment) => void;
  onReorder?: (fromId: string, toId: string) => void;
}

export default function AttachmentPreview({
  attachments,
  onRemove,
  onCancel,
  onRetry,
  onPreview,
  onReorder }: AttachmentPreviewProps) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (attachments.length === 0) return null;

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!onReorder || !dragId || dragId === id) return;
    e.preventDefault();
    setOverId(id);
  };
  const handleDrop = (id: string) => {
    if (onReorder && dragId && dragId !== id) onReorder(dragId, id);
    setDragId(null);
    setOverId(null);
  };

  const clearDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="flex w-full gap-2 overflow-x-auto px-1 pb-1.5 pt-0.5 custom-scrollbar">
      <AnimatePresence initial={false} mode="popLayout">
        {attachments.map((att) => {
          const isReading = att.status === 'reading';
          const isAnalyzing = att.status === 'analyzing';
          const isBusy = isReading || isAnalyzing;
          const isError = att.status === 'error';

          if (att.kind === 'image') {
            return (
              <ImagePreviewCard
                key={att.id}
                attachment={att}
                isReading={isReading}
                isAnalyzing={isAnalyzing}
                isError={isError}
                onRemove={onRemove}
                onCancel={onCancel}
                onRetry={onRetry}
                onPreview={onPreview}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={clearDrag}
                isDragTarget={overId === att.id}
 />
            );
          }

          if (att.kind === 'pdf') {
            return (
              <PdfPreviewCard
                key={att.id}
                attachment={att}
                isReading={isReading}
                isAnalyzing={isAnalyzing}
                isError={isError}
                onRemove={onRemove}
                onCancel={onCancel}
                onRetry={onRetry}
                onPreview={onPreview}
 />
            );
          }

          return (
            <motion.div
              key={att.id}
              layout
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.24, ease: EASE }}
              className={cn(
                'group relative flex min-w-[168px] max-w-[220px] items-center gap-2.5',
                'rounded-[16px] px-2.5 py-2',
                'bg-black/[0.035] dark:bg-white/[0.055]',
                'ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
                isError && 'ring-red-500/30 bg-red-500/[0.06]',
                !isBusy && 'cursor-pointer'
              )}
              onClick={() => {
                if (!isBusy) onPreview(att);
              }}
              role={!isBusy ? 'button' : undefined}
              tabIndex={!isBusy ? 0 : undefined}
              onKeyDown={(e) => {
                if (!isBusy && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onPreview(att);
                }
              }}
            >
              <div className="relative">
                <FileTypeIcon attachment={att} />
                {isBusy && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/35 backdrop-blur-[1px]"
                  >
                    <Spinner size={14} tone="inverse" />
                  </motion.div>
                )}
              </div>

              <div className="min-w-0 flex-1 pr-5">
                <p className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">
                  {att.name}
                </p>
                <p
                  className={cn(
                    'truncate text-micro tracking-[-0.01em]',
                    isError ? 'text-red-500' : 'text-muted-foreground/70'
                  )}
                >
                  {isError
                    ? att.error || 'Failed to attach'
                    : isAnalyzing
                      ? 'Analyzing…'
                      : isReading
                        ? `Uploading ${att.progress}%`
                        : att.extractedText
                          ? `${formatFileSize(att.size)} · text ready`
                          : formatFileSize(att.size)}
                </p>

                {isReading && !isAnalyzing && (
                  <div className="mt-1.5">
                    <ProgressBar progress={att.progress} />
                  </div>
                )}

                {isError && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(att.id);
                    }}
                    className={cn(
                      'mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                      'bg-red-500/10 text-micro font-semibold text-red-600',
                      'hover:bg-red-500/15 dark:text-red-400 transition-colors'
                    )}
                  >
                    <RotateCcw size={10} strokeWidth={2.5} />
                    Retry
                  </button>
                )}
              </div>

              <div className="absolute right-1.5 top-1.5">
                <ActionButton
                  label={isBusy ? `Cancel ${att.name}` : `Remove ${att.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isBusy) onCancel(att.id);
                    else onRemove(att.id);
                  }}
                >
                  <X size={11} strokeWidth={2.5} />
                </ActionButton>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
