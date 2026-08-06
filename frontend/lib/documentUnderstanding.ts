import { apiFetch } from '@/lib/apiClient';

export interface DocumentUnderstandingOcr {
  used: boolean;
  confidence: number | null;
  pagesProcessed: number | null;
  language: string | null;
}

export interface DocumentUnderstandingPage {
  page: number;
  text: string;
  method?: string;
  confidence?: number | null;
}

export interface DocumentUnderstandingSheet {
  name: string;
  text: string;
}

export interface DocumentUnderstandingResult {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
  documentType: string;
  format: string;
  category: string;
  extension?: string;
  extractionMethod: string;
  pageCount: number | null;
  charCount: number;
  language: string | null;
  text: string;
  structured?: {
    pages?: DocumentUnderstandingPage[];
    sheets?: DocumentUnderstandingSheet[];
  };
  ocr: DocumentUnderstandingOcr;
  metadata?: Record<string, unknown>;
  warnings?: string[];
  capabilities?: {
    vision?: boolean;
    rag?: boolean;
    agents?: boolean;
    deepResearch?: boolean;
  };
  analyzedAt: string;
  cached?: boolean;
}

/**
 * Run production document understanding on an uploaded file id.
 * POST /api/files/:id/understand — type detect, extract, OCR, structured JSON.
 */
export async function understandUploadedFile(
  fileId: string,
  options?: { signal?: AbortSignal; force?: boolean }
): Promise<DocumentUnderstandingResult> {
  const params = options?.force ? '?force=true' : '';
  const res = await apiFetch(`/files/${encodeURIComponent(fileId)}/understand${params}`, {
    method: 'POST',
    signal: options?.signal,
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<DocumentUnderstandingResult>;

  if (!res.ok) {
    throw new Error(body.error || 'Unable to analyze document.');
  }

  return body as DocumentUnderstandingResult;
}
