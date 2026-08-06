export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'running'
  | 'interrupted'
  | 'error'
  | 'closed';

export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'interrupted';

export interface GeneratedFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  kind: 'plot' | 'data' | 'document' | 'image' | 'archive' | 'other';
  createdAt: string;
}

export interface PlotArtifact {
  id: string;
  fileId: string;
  mimeType: string;
  path: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface ExecutionResult {
  executionId: string;
  sessionId: string;
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  error: string | null;
  plots: PlotArtifact[];
  files: GeneratedFile[];
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultPreview?: string | null;
}

export interface CodeSession {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastExecutionAt: string | null;
  executionCount: number;
  files: GeneratedFile[];
  plots: PlotArtifact[];
  lastResult: ExecutionResult | null;
  error: string | null;
}

export interface StreamEvent {
  type: string;
  sessionId?: string;
  executionId?: string;
  data?: string;
  plot?: PlotArtifact;
  file?: GeneratedFile;
  status?: string;
  error?: string;
  result?: ExecutionResult;
  timestamp?: string;
}

export interface CodeInterpreterHealth {
  ok?: boolean;
  enabled: boolean;
  pythonAvailable: boolean;
  pythonVersion: string | null;
  packages: Record<string, boolean>;
  platform: string;
  networkIsolation: string;
}
