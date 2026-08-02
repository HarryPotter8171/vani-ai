'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Mic, ArrowUp, Square, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import AttachmentPreview from '@/components/chat/AttachmentPreview';
import {
  ACCEPT_ATTRIBUTE,
  IMAGE_ACCEPT_ATTRIBUTE,
  createLocalId,
  getAttachmentKind,
  readFileAsBase64,
  resolveMimeType,
  validateIncomingFiles,
} from '@/lib/files';
import { ensureImageFileName, isVisionImageFile, optimizeImageForVision } from '@/lib/vision';
import type { MessageAttachment, PendingAttachment } from '@/lib/types';

export interface ChatInputProps {
  onSendMessage: (message: string, attachments?: MessageAttachment[]) => void;
  isLoading?: boolean;
  onStopGenerating?: () => void;
}

const MAX_TEXTAREA_HEIGHT = 160;
const MIN_TEXTAREA_HEIGHT = 24;

type IngestSource = 'upload' | 'paste' | 'camera' | 'drop';

export default function ChatInput({ onSendMessage, isLoading, onStopGenerating }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());
  const dragDepthRef = useRef(0);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // Camera capture is a mobile / touch affordance — keep desktop chrome unchanged.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setShowCamera(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    return () => {
      abortMapRef.current.forEach((c) => c.abort());
      abortMapRef.current.clear();
      attachments.forEach((a) => {
        if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const showAttachError = useCallback((message: string) => {
    setAttachError(message);
    window.setTimeout(() => setAttachError(null), 4200);
  }, []);

  const ingestFiles = useCallback(
    async (fileList: File[] | FileList, source: IngestSource = 'upload') => {
      const incoming = Array.from(fileList).map((file) => {
        if (isVisionImageFile(file)) {
          return ensureImageFileName(
            file,
            source === 'paste' ? 'paste' : source === 'camera' ? 'camera' : 'upload'
          );
        }
        return file;
      });
      if (incoming.length === 0) return;

      setAttachments((prev) => {
        const existingTotal = prev.reduce((sum, a) => sum + a.size, 0);
        const { accepted, errors } = validateIncomingFiles(incoming, prev.length, existingTotal);
        if (errors.length) showAttachError(errors[0]);
        if (accepted.length === 0) return prev;

        const pending: PendingAttachment[] = accepted.map((file) => {
          const kind = getAttachmentKind(file);
          const mimeType = resolveMimeType(file, kind);
          const id = createLocalId();
          return {
            id,
            name: file.name,
            mimeType,
            size: file.size,
            kind,
            status: 'reading' as const,
            progress: 0,
            previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
          };
        });

        queueMicrotask(() => {
          pending.forEach((item, index) => {
            const file = accepted[index];
            const controller = new AbortController();
            abortMapRef.current.set(item.id, controller);

            const run =
              item.kind === 'image'
                ? optimizeImageForVision(
                    file,
                    (percent) => {
                      setAttachments((curr) =>
                        curr.map((a) => (a.id === item.id ? { ...a, progress: percent } : a))
                      );
                    },
                    controller.signal
                  ).then((optimized) => {
                    setAttachments((curr) =>
                      curr.map((a) => {
                        if (a.id !== item.id) return a;
                        if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
                        return {
                          ...a,
                          status: 'ready' as const,
                          progress: 100,
                          dataBase64: optimized.dataBase64,
                          mimeType: optimized.mimeType,
                          size: optimized.size,
                          name: optimized.name,
                          previewUrl: optimized.previewUrl,
                        };
                      })
                    );
                  })
                : readFileAsBase64(
                    file,
                    (percent) => {
                      setAttachments((curr) =>
                        curr.map((a) => (a.id === item.id ? { ...a, progress: percent } : a))
                      );
                    },
                    controller.signal
                  ).then((dataBase64) => {
                    setAttachments((curr) =>
                      curr.map((a) =>
                        a.id === item.id
                          ? { ...a, status: 'ready' as const, progress: 100, dataBase64 }
                          : a
                      )
                    );
                  });

            run
              .catch((err: Error) => {
                if (err.name === 'AbortError') {
                  setAttachments((curr) => {
                    const target = curr.find((a) => a.id === item.id);
                    if (target?.previewUrl?.startsWith('blob:')) {
                      URL.revokeObjectURL(target.previewUrl);
                    }
                    return curr.filter((a) => a.id !== item.id);
                  });
                  return;
                }
                setAttachments((curr) =>
                  curr.map((a) =>
                    a.id === item.id
                      ? { ...a, status: 'error', error: 'Couldn’t prepare this image' }
                      : a
                  )
                );
              })
              .finally(() => {
                abortMapRef.current.delete(item.id);
              });
          });
        });

        return [...prev, ...pending];
      });
    },
    [showAttachError]
  );

  const removeAttachment = useCallback((id: string) => {
    abortMapRef.current.get(id)?.abort();
    abortMapRef.current.delete(id);
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const cancelAttachment = useCallback(
    (id: string) => {
      removeAttachment(id);
    },
    [removeAttachment]
  );

  const submit = () => {
    const ready = attachments.filter((a) => a.status === 'ready' && a.dataBase64);
    const reading = attachments.some((a) => a.status === 'reading');
    if (isLoading || reading) return;
    if (!input.trim() && ready.length === 0) return;

    const payload: MessageAttachment[] = ready.map(
      ({ id, name, mimeType, size, kind, previewUrl, dataBase64 }) => ({
        id,
        name,
        mimeType,
        size,
        kind,
        previewUrl,
        dataBase64,
      })
    );

    onSendMessage(input.trim(), payload.length ? payload : undefined);
    setInput('');
    setAttachments([]);
    abortMapRef.current.clear();
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
        textareaRef.current.focus();
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) {
      onStopGenerating?.();
      return;
    }
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files, 'paste');
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      void ingestFiles(e.dataTransfer.files, 'drop');
    }
  };

  const hasReadyAttachments = attachments.some((a) => a.status === 'ready');
  const isReading = attachments.some((a) => a.status === 'reading');
  const canSend =
    (input.trim().length > 0 || hasReadyAttachments) && !isLoading && !isReading;

  const controlBtnClass = cn(
    'hover-lift flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
    'text-muted-foreground/75',
    'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
    'hover:bg-black/[0.045] hover:text-foreground',
    'dark:hover:bg-white/[0.07] dark:hover:text-[#f5f5f7]',
    'disabled:cursor-not-allowed disabled:opacity-40'
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-6 sm:px-5 sm:pb-7 md:px-6 md:pb-8">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/80 to-transparent" />

      <div className="pointer-events-auto relative w-full max-w-[860px]">
        {attachError && (
          <div
            className={cn(
              'mb-2 rounded-[14px] px-3.5 py-2 text-[12.5px] tracking-[-0.01em]',
              'bg-red-500/10 text-red-600 dark:text-red-400',
              'ring-1 ring-red-500/20 backdrop-blur-xl'
            )}
            role="alert"
          >
            {attachError}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            'relative flex w-full flex-col gap-1',
            'rounded-[28px] px-2.5 py-2 sm:px-3',
            'bg-white/50 dark:bg-white/[0.05]',
            'backdrop-blur-3xl backdrop-saturate-[1.8]',
            'border border-black/[0.04] dark:border-white/[0.06]',
            'shadow-[0_2px_4px_rgba(0,0,0,0.02),0_16px_44px_rgba(0,0,0,0.06),inset_0_0.5px_0_rgba(255,255,255,0.6)]',
            'dark:shadow-[0_2px_4px_rgba(0,0,0,0.2),0_20px_56px_rgba(0,0,0,0.35),inset_0_0.5px_0_rgba(255,255,255,0.045)]',
            'transition-[background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
            'focus-within:bg-white/60 dark:focus-within:bg-white/[0.08]',
            'focus-within:border-black/[0.055] dark:focus-within:border-white/[0.09]',
            'focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.03),0_20px_52px_rgba(0,0,0,0.09),0_0_0_3px_rgba(0,113,227,0.07),inset_0_0.5px_0_rgba(255,255,255,0.7)]',
            'dark:focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.28),0_24px_64px_rgba(0,0,0,0.45),0_0_0_3px_rgba(10,132,255,0.12),inset_0_0.5px_0_rgba(255,255,255,0.08)]',
            isDragging &&
              'border-primary/40 bg-primary/[0.04] shadow-[0_0_0_3px_rgba(0,113,227,0.12)] dark:border-primary/50'
          )}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[28px] bg-primary/[0.06] backdrop-blur-[2px]">
              <p className="text-[13.5px] font-medium tracking-[-0.015em] text-primary">
                Drop images or files to attach
              </p>
            </div>
          )}

          <AttachmentPreview
            attachments={attachments}
            onRemove={removeAttachment}
            onCancel={cancelAttachment}
          />

          <div className="flex w-full items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void ingestFiles(e.target.files, 'upload');
                e.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTRIBUTE}
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void ingestFiles(e.target.files, 'camera');
                e.target.value = '';
              }}
            />

            {/* Attachment — left */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className={controlBtnClass}
              aria-label="Attach file"
            >
              <Paperclip size={18} strokeWidth={1.75} />
            </button>

            {/* Camera — touch / mobile only */}
            {showCamera && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isLoading}
                className={controlBtnClass}
                aria-label="Take photo"
              >
                <Camera size={18} strokeWidth={1.75} />
              </button>
            )}

            {/* Auto-growing textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Message VANI AI..."
              disabled={isLoading}
              rows={1}
              className={cn(
                'min-w-0 flex-1 resize-none bg-transparent',
                'py-[9px] text-[15.5px] leading-6 tracking-[-0.016em]',
                'text-foreground',
                'placeholder:text-muted-foreground/40',
                'outline-none border-none ring-0 focus:ring-0',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'custom-scrollbar overflow-y-auto'
              )}
              style={{ height: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT }}
            />

            {/* Microphone */}
            <button type="button" className={controlBtnClass} aria-label="Voice input">
              <Mic size={18} strokeWidth={1.75} />
            </button>

            {/* Send — blue circular */}
            <button
              type="submit"
              disabled={!canSend && !isLoading}
              className={cn(
                'hover-lift flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                'transition-[background-color,box-shadow,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                canSend
                  ? 'bg-[#0071e3] text-white shadow-[0_1px_2px_rgba(0,113,227,0.18),0_4px_14px_rgba(0,113,227,0.24)] hover:brightness-[1.05] dark:bg-[#0A84FF] dark:shadow-[0_1px_2px_rgba(10,132,255,0.22),0_4px_14px_rgba(10,132,255,0.26)]'
                  : isLoading
                    ? 'bg-[#0071e3]/85 text-white dark:bg-[#0A84FF]/85'
                    : 'bg-black/[0.035] text-muted-foreground/30 cursor-not-allowed dark:bg-white/[0.05] dark:text-white/20'
              )}
              aria-label={isLoading ? 'Stop generating' : 'Send message'}
            >
              {isLoading ? (
                <Square size={11} strokeWidth={2.5} fill="currentColor" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
