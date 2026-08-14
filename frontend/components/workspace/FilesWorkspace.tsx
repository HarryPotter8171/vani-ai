'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Files,
  Upload,
  FileText,
  ImageIcon,
  Trash2,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { SkeletonList } from '@/components/ui/Skeleton';
import type { ProjectFile } from '@/lib/types';
import {
  getAttachmentKind,
  readFileAsBase64,
  resolveMimeType,
} from '@/lib/files';
import { getUserFriendlyError } from '@/lib/userFacingError';

export interface FilesWorkspaceProps {
  projectId: string | null;
  projectName?: string | null;
  files: ProjectFile[];
  loading?: boolean;
  onRefresh?: () => void;
  onUpload?: (file: {
    name: string;
    mimeType: string;
    size: number;
    kind: string;
    dataBase64: string;
  }) => Promise<void> | void;
  onDelete?: (fileId: string) => Promise<void> | void;
  onSummarize?: (fileName: string) => void;
  onResearch?: (fileName: string) => void;
  compact?: boolean;
  className?: string;
}

function fileIcon(kind?: string) {
  if (kind === 'image') return ImageIcon;
  return FileText;
}

export default function FilesWorkspace({
  projectId,
  projectName,
  files,
  loading,
  onRefresh,
  onUpload,
  onDelete,
  onSummarize,
  onResearch,
  compact,
  className,
}: FilesWorkspaceProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handlePick = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !projectId || !onUpload) return;
      setUploading(true);
      try {
        for (const file of Array.from(list)) {
          const kind = getAttachmentKind(file);
          const mimeType = resolveMimeType(file, kind);
          const dataBase64 = await readFileAsBase64(file, () => {});
          await onUpload({
            name: file.name,
            mimeType,
            size: file.size,
            kind,
            dataBase64,
          });
        }
        onRefresh?.();
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [projectId, onUpload, onRefresh]
  );

  if (!projectId) {
    return (
      <div className={cn('px-4 py-8 text-center', className)}>
        <BookOpen size={22} className="mx-auto mb-3 text-accent" strokeWidth={1.75} />
        <p className="text-sm font-semibold tracking-[-0.016em] text-foreground">
          Select a project
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Knowledge files live inside a project workspace.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <div>
          <div className="os-section-label px-0">
            {compact ? 'Knowledge' : 'Files & Knowledge'}
          </div>
          {projectName ? (
            <p className="mt-0.5 truncate text-caption text-text-secondary">{projectName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !onUpload}
          className={cn(
            'btn-ripple flex items-center gap-1.5 rounded-full px-2.5 py-1.5',
            'bg-accent-muted text-micro font-semibold text-accent',
            'hover:bg-accent/20 disabled:opacity-50'
          )}
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Add
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,text/markdown,text/csv,image/*"
          onChange={(e) => void handlePick(e.target.files)}
        />
      </div>

      {loading ? (
        <SkeletonList rows={4} className="py-2" />
      ) : files.length === 0 ? (
        <PremiumEmpty
          size="sm"
          icon={Files}
          title="No files yet"
          description="Upload PDFs, docs, or images to build project knowledge."
          className="rounded-[16px] border border-dashed border-border py-8"
        />
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {files.map((file) => {
              const Icon = fileIcon(file.kind);
              return (
                <motion.li
                  key={file._id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE.smooth }}
                  className={cn(
                    'group flex items-start gap-2.5 rounded-[14px] px-2.5 py-2.5',
                    'border border-transparent hover:border-border hover:bg-surface-hover'
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-muted text-accent">
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold tracking-[-0.014em] text-foreground">
                      {file.name}
                    </p>
                    <p className="mt-0.5 text-micro capitalize text-text-tertiary">
                      {file.status || 'ready'}
                      {file.createdAt ? ` · ${formatRelativeTime(file.createdAt)}` : ''}
                    </p>
                    {!compact ? (
                      <div className="mt-1.5 flex flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {onSummarize ? (
                          <button
                            type="button"
                            onClick={() => onSummarize(file.name)}
                            className="rounded-full bg-surface-hover px-2 py-0.5 text-micro font-medium text-text-secondary hover:text-foreground"
                          >
                            Summarize
                          </button>
                        ) : null}
                        {onResearch ? (
                          <button
                            type="button"
                            onClick={() => onResearch(file.name)}
                            className="rounded-full bg-surface-hover px-2 py-0.5 text-micro font-medium text-text-secondary hover:text-foreground"
                          >
                            Research
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {onDelete ? (
                    <button
                      type="button"
                      aria-label={`Delete ${file.name}`}
                      onClick={() => void onDelete(file._id)}
                      className="rounded-md p-1 text-text-tertiary opacity-0 hover:bg-danger-muted hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/** Lightweight hook to list project knowledge files via existing API. */
export function useProjectFiles(projectId: string | null) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  const refresh = useCallback(() => setToken((t) => t + 1), []);

  useEffect(() => {
    if (!projectId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void import('@/lib/apiClient')
      .then(({ apiFetch }) =>
        apiFetch(`/projects/${projectId}/files`).then(async (res) => {
          if (!res.ok) throw new Error('Unable to load files');
          return res.json() as Promise<ProjectFile[]>;
        })
      )
      .then((data) => {
        if (!cancelled) setFiles(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            getUserFriendlyError(err, {
              feature: 'file',
              fallback: 'Unable to load files',
            })
          );
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, token]);

  return { files, loading, error, refresh };
}
