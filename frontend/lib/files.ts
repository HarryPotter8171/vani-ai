export type AttachmentKind =
  | 'image'
  | 'pdf'
  | 'docx'
  | 'text'
  | 'markdown'
  | 'csv'
  | 'xlsx'
  | 'zip'
  | 'unknown';

/** Per-file cap — aligned with backend/config/upload.js (25 MB). */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
/** Soft total budget across attachments in one composer turn. */
export const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024;

const EXT_TO_KIND: Record<string, AttachmentKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  heic: 'image',
  heif: 'image',
  bmp: 'image',
  pdf: 'pdf',
  docx: 'docx',
  txt: 'text',
  md: 'markdown',
  markdown: 'markdown',
  csv: 'csv',
  xlsx: 'xlsx',
  xls: 'xlsx',
  zip: 'zip',
};

const MIME_TO_KIND: Record<string, AttachmentKind> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'image/bmp': 'image',
  'image/x-ms-bitmap': 'image',
  'image/x-bmp': 'image',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

export const ACCEPT_ATTRIBUTE = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.xlsx',
  '.xls',
  '.zip',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.bmp',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'application/pdf',
].join(',');

/** Image-only accept string for camera / vision pickers */
export const IMAGE_ACCEPT_ATTRIBUTE =
  'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.bmp';

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

export function getAttachmentKind(file: { name: string; type?: string }): AttachmentKind {
  const mime = (file.type || '').toLowerCase();
  if (mime && MIME_TO_KIND[mime]) return MIME_TO_KIND[mime];
  return EXT_TO_KIND[getExtension(file.name)] ?? 'unknown';
}

export function resolveMimeType(file: { name: string; type?: string }, kind: AttachmentKind): string {
  if (file.type) return file.type;
  switch (kind) {
    case 'image': {
      const ext = getExtension(file.name);
      if (ext === 'png') return 'image/png';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'gif') return 'image/gif';
      if (ext === 'heic' || ext === 'heif') return 'image/heic';
      if (ext === 'bmp') return 'image/bmp';
      return 'image/jpeg';
    }
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'markdown':
      return 'text/markdown';
    case 'csv':
      return 'text/csv';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'zip':
      return 'application/zip';
    case 'text':
    default:
      return 'text/plain';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSupportedFile(file: File): boolean {
  return getAttachmentKind(file) !== 'unknown';
}

export interface FileValidationResult {
  accepted: File[];
  errors: string[];
}

export function validateIncomingFiles(
  incoming: File[],
  existingCount: number,
  existingTotalBytes: number
): FileValidationResult {
  const errors: string[] = [];
  const accepted: File[] = [];
  let total = existingTotalBytes;

  for (const file of incoming) {
    if (!isSupportedFile(file)) {
      errors.push(`“${file.name}” isn’t a supported file type.`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`“${file.name}” exceeds the ${formatFileSize(MAX_FILE_SIZE_BYTES)} limit.`);
      continue;
    }
    if (existingCount + accepted.length >= MAX_FILES) {
      errors.push(`You can attach up to ${MAX_FILES} files.`);
      break;
    }
    if (total + file.size > MAX_TOTAL_SIZE_BYTES) {
      errors.push(`Total attachment size exceeds ${formatFileSize(MAX_TOTAL_SIZE_BYTES)}.`);
      break;
    }
    accepted.push(file);
    total += file.size;
  }

  return { accepted, errors };
}

/** Read a File to base64 (no data-URL prefix) with progress + abort support. */
export function readFileAsBase64(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    const onAbort = () => {
      reader.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    reader.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      onProgress(100);
      resolve(base64);
    };

    reader.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(reader.error ?? new Error('Failed to read file'));
    };

    reader.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    reader.readAsDataURL(file);
  });
}

export function createLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
