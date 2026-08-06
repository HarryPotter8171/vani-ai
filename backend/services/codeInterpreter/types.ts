/**
 * VANI AI — Code Interpreter types
 */

export type SessionStatus =
  | "idle"
  | "starting"
  | "ready"
  | "running"
  | "interrupted"
  | "error"
  | "closed";

export type ExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "interrupted";

export type StreamEventType =
  | "stdout"
  | "stderr"
  | "status"
  | "plot"
  | "file"
  | "result"
  | "error"
  | "done";

export interface CodeInterpreterLimits {
  cpuSeconds: number;
  memoryMb: number;
  diskMb: number;
  timeoutMs: number;
  maxSessionsPerUser: number;
  maxCodeChars: number;
  maxOutputChars: number;
  maxPlots: number;
  maxGeneratedFiles: number;
  sessionTtlMs: number;
  idleTtlMs: number;
}

export interface GeneratedFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  kind: "plot" | "data" | "document" | "image" | "archive" | "other";
  createdAt: string;
}

export interface PlotArtifact {
  id: string;
  fileId: string;
  mimeType: string;
  /** Relative path inside session workspace (e.g. plots/plot_1.png) */
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
  /** Truncated repr of last expression when available */
  resultPreview?: string | null;
}

export interface StreamEvent {
  type: StreamEventType;
  sessionId: string;
  executionId?: string;
  data?: string;
  plot?: PlotArtifact;
  file?: GeneratedFile;
  status?: SessionStatus | ExecutionStatus;
  error?: string;
  timestamp: string;
}

export interface SessionSnapshot {
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
  limits: CodeInterpreterLimits;
  error: string | null;
}

export interface ExecuteOptions {
  code: string;
  timeoutMs?: number;
  onEvent?: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

export interface UploadFileInput {
  originalName: string;
  buffer: Buffer;
  mimeType?: string;
}

export interface AuditEvent {
  action: string;
  userId: string;
  sessionId?: string;
  executionId?: string;
  meta?: Record<string, unknown>;
  timestamp: string;
  level: "info" | "warn" | "error";
}
