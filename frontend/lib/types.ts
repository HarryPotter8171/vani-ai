import type { AttachmentKind } from '@/lib/files';

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /** Object/data URL for image thumbnails in the UI */
  previewUrl?: string;
  /** Raw base64 payload (no data-URL prefix) — sent to the API */
  dataBase64?: string;
}

export type PendingAttachmentStatus = 'reading' | 'ready' | 'error';

export interface PendingAttachment extends MessageAttachment {
  status: PendingAttachmentStatus;
  progress: number;
  error?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
}

export interface ChatSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt?: string;
  project?: string | null;
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
