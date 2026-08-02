'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, FileSpreadsheet, FileArchive, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/files';
import type { PendingAttachment } from '@/lib/types';

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
      <div
        className={cn(
          shell,
          'flex items-center justify-center bg-emerald-600/90 text-white'
        )}
      >
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

function ImagePreviewCard({
  attachment,
  isReading,
  isError,
  onRemove,
  onCancel,
}: {
  attachment: PendingAttachment;
  isReading: boolean;
  isError: boolean;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <motion.div
      key={attachment.id}
      layout
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        'relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[16px]',
        'ring-1 ring-black/[0.06] dark:ring-white/[0.08]',
        'bg-black/[0.035] dark:bg-white/[0.055]',
        isError && 'ring-red-500/35'
      )}
    >
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
          Image
        </div>
      )}

      {isReading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 backdrop-blur-[1px]">
          <Loader2 size={16} className="animate-spin text-white" />
          <span className="text-[10px] font-medium text-white/90">{attachment.progress}%</span>
          <div className="absolute inset-x-2 bottom-2 h-[2px] overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-150 ease-out"
              style={{ width: `${attachment.progress}%` }}
            />
          </div>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 px-1.5 text-center text-[10px] font-medium text-red-100">
          Failed
        </div>
      )}

      <button
        type="button"
        onClick={() => (isReading ? onCancel(attachment.id) : onRemove(attachment.id))}
        className={cn(
          'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full',
          'bg-black/55 text-white hover:bg-black/70',
          'backdrop-blur-sm transition-colors duration-150'
        )}
        aria-label={isReading ? `Cancel ${attachment.name}` : `Remove ${attachment.name}`}
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

export interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
}

export default function AttachmentPreview({
  attachments,
  onRemove,
  onCancel,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex w-full gap-2 overflow-x-auto px-1 pb-1.5 pt-0.5 custom-scrollbar">
      <AnimatePresence initial={false} mode="popLayout">
        {attachments.map((att) => {
          const isReading = att.status === 'reading';
          const isError = att.status === 'error';

          if (att.kind === 'image') {
            return (
              <ImagePreviewCard
                key={att.id}
                attachment={att}
                isReading={isReading}
                isError={isError}
                onRemove={onRemove}
                onCancel={onCancel}
              />
            );
          }

          return (
            <motion.div
              key={att.id}
              layout
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 4 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className={cn(
                'relative flex min-w-[168px] max-w-[220px] items-center gap-2.5',
                'rounded-[16px] px-2.5 py-2',
                'bg-black/[0.035] dark:bg-white/[0.055]',
                'ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
                isError && 'ring-red-500/30 bg-red-500/[0.06]'
              )}
            >
              <div className="relative">
                <FileTypeIcon attachment={att} />
                {isReading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/35 backdrop-blur-[1px]">
                    <Loader2 size={14} className="animate-spin text-white" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 pr-4">
                <p className="truncate text-[12.5px] font-medium tracking-[-0.01em] text-foreground">
                  {att.name}
                </p>
                <p
                  className={cn(
                    'truncate text-[11px] tracking-[-0.01em]',
                    isError ? 'text-red-500' : 'text-muted-foreground/70'
                  )}
                >
                  {isError
                    ? att.error || 'Failed to attach'
                    : isReading
                      ? `Uploading ${att.progress}%`
                      : formatFileSize(att.size)}
                </p>

                {isReading && (
                  <div className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
                      style={{ width: `${att.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => (isReading ? onCancel(att.id) : onRemove(att.id))}
                className={cn(
                  'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full',
                  'bg-black/[0.08] text-foreground/70 hover:bg-black/[0.14] hover:text-foreground',
                  'dark:bg-white/[0.1] dark:hover:bg-white/[0.16]',
                  'transition-colors duration-150'
                )}
                aria-label={isReading ? `Cancel ${att.name}` : `Remove ${att.name}`}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
