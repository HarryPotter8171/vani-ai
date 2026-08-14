'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
  createLocalId,
  getAttachmentKind,
  resolveMimeType,
  validateIncomingFiles,
} from '@/lib/files';
import { understandUploadedFile } from '@/lib/documentUnderstanding';
import { ensureImageFileName, isVisionImageFile, optimizeImageForVision } from '@/lib/vision';
import {
  base64ToBlob,
  deleteUploadedFileOnServer,
  fileContentUrl,
  uploadFilesToServer,
} from '@/lib/upload';
import type { MessageAttachment, PendingAttachment } from '@/lib/types';
import { getUserFriendlyError } from '@/lib/userFacingError';

export type IngestSource = 'upload' | 'paste' | 'camera' | 'drop';

function revokePreview(url?: string) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

function previewUrlForFile(file: File, kind: PendingAttachment['kind']): string | undefined {
  if (kind === 'image' || kind === 'pdf') return URL.createObjectURL(file);
  return undefined;
}

/** Kinds that go through document understanding after upload. */
function shouldUnderstand(kind: PendingAttachment['kind']): boolean {
  return (
    kind === 'image' ||
    kind === 'pdf' ||
    kind === 'docx' ||
    kind === 'text' ||
    kind === 'markdown' ||
    kind === 'csv' ||
    kind === 'xlsx'
  );
}

/**
 * Composer attachment pipeline: validate → optimize (images) → multipart upload
 * → document understanding (Analyzing…), with per-file cancel, retry, and calm toasts.
 */
export function useFileUpload() {
  const { showToast } = useToast();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const attachmentsRef = useRef<PendingAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    const abortMap = abortMapRef.current;
    const fileMap = fileMapRef.current;
    return () => {
      abortMap.forEach((c) => c.abort());
      abortMap.clear();
      attachmentsRef.current.forEach((a) => revokePreview(a.previewUrl));
      fileMap.clear();
    };
  }, []);

  const patchAttachment = useCallback((id: string, patch: Partial<PendingAttachment>) => {
    setAttachments((curr) => curr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const runUnderstand = useCallback(
    async (id: string, fileId: string, signal: AbortSignal) => {
      patchAttachment(id, {
        status: 'analyzing',
        progress: 100,
        error: undefined,
      });

      const result = await understandUploadedFile(fileId, { signal });

      setAttachments((curr) =>
        curr.map((a) => {
          if (a.id !== id) return a;
          return {
            ...a,
            status: 'ready' as const,
            progress: 100,
            extractedText: result.text,
            documentType: result.documentType,
            extractionMethod: result.extractionMethod,
            understanding: result,
            error: undefined,
          };
        })
      );
    },
    [patchAttachment]
  );

  const runUpload = useCallback(
    async (id: string, file: File, kind: PendingAttachment['kind']) => {
      const controller = new AbortController();
      abortMapRef.current.set(id, controller);
      let uploadedId = '';

      try {
        let uploadedMime = '';
        let uploadedSize = 0;
        let uploadedName = file.name;
        let previewUrl: string | undefined;

        if (kind === 'image') {
          // Optimize occupies 0–50%; network upload 50–85%; understanding 85–100%.
          const optimized = await optimizeImageForVision(
            file,
            (percent) => {
              patchAttachment(id, { progress: Math.min(50, Math.round(percent * 0.5)) });
            },
            controller.signal
          );
          patchAttachment(id, { progress: 50 });
          const blob = base64ToBlob(optimized.dataBase64, optimized.mimeType);
          const [uploaded] = await uploadFilesToServer([blob], {
            signal: controller.signal,
            names: [optimized.name],
            onProgress: ({ percent }) => {
              if (typeof percent !== 'number') return;
              patchAttachment(id, { progress: Math.min(85, 50 + Math.round(percent * 0.35)) });
            },
          });

          if (!uploaded?.id) {
            throw new Error('Upload succeeded but no file id was returned.');
          }

          uploadedId = uploaded.id;
          uploadedMime = uploaded.mimeType || optimized.mimeType;
          uploadedSize = uploaded.size || optimized.size;
          uploadedName = uploaded.filename || optimized.name;
          previewUrl = optimized.previewUrl;

          setAttachments((curr) =>
            curr.map((a) => {
              if (a.id !== id) return a;
              revokePreview(a.previewUrl);
              return {
                ...a,
                status: 'analyzing' as const,
                progress: 88,
                fileId: uploadedId,
                mimeType: uploadedMime,
                size: uploadedSize,
                name: uploadedName,
                previewUrl,
                dataBase64: undefined,
                error: undefined,
              };
            })
          );
        } else {
          patchAttachment(id, { progress: 2 });
          const [uploaded] = await uploadFilesToServer([file], {
            signal: controller.signal,
            onProgress: ({ percent }) => {
              if (typeof percent !== 'number') return;
              patchAttachment(id, {
                progress: Math.min(85, Math.max(2, Math.round(percent * 0.85))),
              });
            },
          });

          if (!uploaded?.id) {
            throw new Error('Upload succeeded but no file id was returned.');
          }

          uploadedId = uploaded.id;
          uploadedMime = uploaded.mimeType || resolveMimeType(file, kind);
          uploadedSize = uploaded.size || file.size;
          uploadedName = uploaded.filename || file.name;

          patchAttachment(id, {
            status: 'analyzing',
            progress: 88,
            fileId: uploadedId,
            mimeType: uploadedMime,
            size: uploadedSize,
            name: uploadedName,
            dataBase64: undefined,
            error: undefined,
          });
        }

        if (shouldUnderstand(kind)) {
          await runUnderstand(id, uploadedId, controller.signal);
        } else {
          patchAttachment(id, {
            status: 'ready',
            progress: 100,
            fileId: uploadedId,
            mimeType: uploadedMime,
            size: uploadedSize,
            name: uploadedName,
            error: undefined,
          });
        }
      } catch (err) {
        const error = err as Error;
        if (error.name === 'AbortError') {
          // Upload may have already persisted — delete owned bytes so cancel
          // does not leave orphans under backend/uploads.
          if (uploadedId) void deleteUploadedFileOnServer(uploadedId);
          setAttachments((curr) => {
            const target = curr.find((a) => a.id === id);
            revokePreview(target?.previewUrl);
            return curr.filter((a) => a.id !== id);
          });
          fileMapRef.current.delete(id);
          return;
        }

        const message = getUserFriendlyError(error, {
          feature: 'upload',
          fallback: 'Couldn’t process this file',
        });
        patchAttachment(id, { status: 'error', error: message, progress: 0 });
        showToast(message, 'error');
      } finally {
        abortMapRef.current.delete(id);
      }
    },
    [patchAttachment, runUnderstand, showToast]
  );

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

      const existing = attachmentsRef.current;
      const existingTotal = existing.reduce((sum, a) => sum + a.size, 0);
      const { accepted, errors } = validateIncomingFiles(
        incoming,
        existing.length,
        existingTotal
      );

      if (errors.length) showToast(errors[0], 'error');
      if (accepted.length === 0) return;

      const pending: PendingAttachment[] = accepted.map((file) => {
        const kind = getAttachmentKind(file);
        const mimeType = resolveMimeType(file, kind);
        const id = createLocalId();
        fileMapRef.current.set(id, file);
        return {
          id,
          name: file.name,
          mimeType,
          size: file.size,
          kind,
          status: 'reading' as const,
          progress: 0,
          previewUrl: previewUrlForFile(file, kind),
        };
      });

      setAttachments((prev) => [...prev, ...pending]);

      pending.forEach((item, index) => {
        void runUpload(item.id, accepted[index], item.kind);
      });
    },
    [runUpload, showToast]
  );

  const removeAttachment = useCallback((id: string) => {
    const existing = attachmentsRef.current.find((a) => a.id === id);
    const fileId = existing?.fileId;
    abortMapRef.current.get(id)?.abort();
    abortMapRef.current.delete(id);
    fileMapRef.current.delete(id);
    if (fileId) void deleteUploadedFileOnServer(fileId);
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      revokePreview(target?.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const cancelAttachment = useCallback(
    (id: string) => {
      removeAttachment(id);
    },
    [removeAttachment]
  );

  const retryAttachment = useCallback(
    (id: string) => {
      const file = fileMapRef.current.get(id);
      const current = attachmentsRef.current.find((a) => a.id === id);
      if (!file || !current || current.status !== 'error') return;

      patchAttachment(id, {
        status: 'reading',
        progress: 0,
        error: undefined,
        extractedText: undefined,
        understanding: undefined,
        documentType: undefined,
        extractionMethod: undefined,
      });
      void runUpload(id, file, current.kind);
    },
    [patchAttachment, runUpload]
  );

  const reorderAttachments = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setAttachments((prev) => {
      const fromIndex = prev.findIndex((a) => a.id === fromId);
      const toIndex = prev.findIndex((a) => a.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

  const moveAttachment = useCallback((id: string, direction: -1 | 1) => {
    setAttachments((prev) => {
      const index = prev.findIndex((a) => a.id === id);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const clearAttachments = useCallback(() => {
    abortMapRef.current.forEach((c) => c.abort());
    abortMapRef.current.clear();
    attachmentsRef.current.forEach((a) => {
      revokePreview(a.previewUrl);
      if (a.fileId) void deleteUploadedFileOnServer(a.fileId);
    });
    fileMapRef.current.clear();
    setAttachments([]);
  }, []);

  const takeReadyAttachments = useCallback((): MessageAttachment[] => {
    const current = attachmentsRef.current;
    const ready = current.filter((a) => a.status === 'ready' && a.fileId);
    const payload: MessageAttachment[] = ready.map(
      ({
        id,
        fileId,
        name,
        mimeType,
        size,
        kind,
        previewUrl,
        extractedText,
        documentType,
        extractionMethod,
      }) => {
        // Prefer durable server content URL for images so history reload works.
        const durablePreview =
          kind === 'image' && fileId ? fileContentUrl(fileId) : previewUrl;
        if (previewUrl && previewUrl !== durablePreview) {
          revokePreview(previewUrl);
        }
        return {
          id: fileId || id,
          fileId,
          name,
          mimeType,
          size,
          kind,
          previewUrl: durablePreview,
          extractedText,
          documentType,
          extractionMethod,
        };
      }
    );

    // Keep ready preview URLs for the sent bubble; revoke leftover chips.
    const readyIds = new Set(ready.map((a) => a.id));
    current.forEach((a) => {
      fileMapRef.current.delete(a.id);
      if (!readyIds.has(a.id)) revokePreview(a.previewUrl);
    });
    abortMapRef.current.forEach((c) => c.abort());
    abortMapRef.current.clear();
    setAttachments([]);
    return payload;
  }, []);

  const isBusy = attachments.some((a) => a.status === 'reading' || a.status === 'analyzing');
  const isReading = isBusy;
  const hasReady = attachments.some((a) => a.status === 'ready');
  const hasError = attachments.some((a) => a.status === 'error');
  const isAnalyzing = attachments.some((a) => a.status === 'analyzing');

  return {
    attachments,
    ingestFiles,
    removeAttachment,
    cancelAttachment,
    retryAttachment,
    reorderAttachments,
    moveAttachment,
    clearAttachments,
    takeReadyAttachments,
    isReading,
    isAnalyzing,
    hasReady,
    hasError,
  };
}
