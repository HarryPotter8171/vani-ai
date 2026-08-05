import type { AttachmentKind } from '@/lib/files';
import type { DocumentUnderstandingResult } from '@/lib/documentUnderstanding';

export interface MessageAttachment {
  id: string;
  /** Server upload id from POST /api/files/upload — preferred over dataBase64. */
  fileId?: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /** Object/data URL for image thumbnails in the UI */
  previewUrl?: string;
  /**
   * Raw base64 payload (no data-URL prefix). Optional when `fileId` is set —
   * the backend hydrates bytes from disk.
   */
  dataBase64?: string;
  /** Plain text from document understanding (shown in preview; powers follow-ups). */
  extractedText?: string;
  documentType?: string;
  extractionMethod?: string;
}

export type PendingAttachmentStatus = 'reading' | 'analyzing' | 'ready' | 'error';

export interface PendingAttachment extends MessageAttachment {
  status: PendingAttachmentStatus;
  progress: number;
  error?: string;
  understanding?: DocumentUnderstandingResult;
}

export interface MessageMeta {
  model?: string;
  provider?: string;
  displayName?: string;
  reason?: string;
  fallback?: boolean;
}

export interface MessageUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  provider?: string;
  model?: string;
  modelKey?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  meta?: MessageMeta;
  usage?: MessageUsage;
}

export interface ChatSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt?: string;
  project?: string | null;
  pinned?: boolean;
}

export type ProjectMemoryCategory =
  | 'preference'
  | 'writing_style'
  | 'coding_style'
  | 'goal'
  | 'decision'
  | 'fact'
  | 'other';

export interface ProjectSettings {
  model?: string;
  temperature?: number;
  ragTopK?: number;
  ragMaxChars?: number;
  autoSearchKnowledge?: boolean;
  includeMemories?: boolean;
}

export interface ProjectStats {
  fileCount?: number;
  chunkCount?: number;
  chatCount?: number;
  memoryCount?: number;
}

export interface Project {
  _id: string;
  name: string;
  description?: string;
  instructions?: string;
  systemPrompt?: string;
  pinned?: boolean;
  archived?: boolean;
  settings?: ProjectSettings;
  stats?: ProjectStats;
  lastOpenedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectMemory {
  _id: string;
  category: ProjectMemoryCategory;
  key: string;
  value: string;
  updatedAt?: string;
}

export interface ProjectFile {
  _id: string;
  name: string;
  mimeType?: string;
  kind?: string;
  size?: number;
  status?: 'pending' | 'indexing' | 'ready' | 'error';
  error?: string;
  chunkCount?: number;
  createdAt?: string;
}
