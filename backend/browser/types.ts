/**
 * Shared types for VANI Browser Automation.
 */

export type BrowserEngine = "chromium" | "firefox" | "webkit";

export type BrowserSessionMode = "isolated" | "persistent" | "private";

export type BrowserRunStatus =
  | "idle"
  | "awaiting_approval"
  | "planning"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type BrowserStepAction =
  | "open"
  | "navigate"
  | "click"
  | "fill"
  | "type"
  | "upload"
  | "download"
  | "screenshot"
  | "extract"
  | "wait"
  | "scroll"
  | "switch_tab"
  | "handle_dialog"
  | "press"
  | "hover"
  | "select";

export type BrowserStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";

export type PermissionChoice = "allow_once" | "always_allow" | "deny";

export type TimelineEventKind =
  | "opening"
  | "loading"
  | "clicking"
  | "typing"
  | "reading"
  | "uploading"
  | "downloading"
  | "scrolling"
  | "waiting"
  | "screenshot"
  | "paused"
  | "resumed"
  | "completed"
  | "failed"
  | "info"
  | "warning"
  | "approval";

export interface BrowserStep {
  id: string;
  action: BrowserStepAction;
  label: string;
  url?: string;
  selector?: string;
  value?: string;
  filePath?: string;
  timeoutMs?: number;
  dangerous?: boolean;
  dangerReason?: string;
  status: BrowserStepStatus;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: Record<string, unknown>;
}

export interface BrowserPlan {
  id: string;
  goal: string;
  origin?: string;
  steps: BrowserStep[];
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  message: string;
  at: string;
  stepId?: string;
  meta?: Record<string, unknown>;
}

export interface ScreenshotRecord {
  id: string;
  at: string;
  url: string;
  stepId?: string;
  mimeType: string;
  /** Base64 (no data: prefix). Kept in memory for active runs. */
  data: string;
}

export interface BrowserPermissionRecord {
  userId: string;
  origin: string;
  alwaysAllow: boolean;
  alwaysDeny: boolean;
  updatedAt?: string;
}

export interface BrowserSessionOptions {
  userId: string;
  engine?: BrowserEngine;
  mode?: BrowserSessionMode;
  persistCookies?: boolean;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  downloadDir?: string;
}

export interface BrowserRunSnapshot {
  runId: string;
  sessionId: string | null;
  userId: string;
  status: BrowserRunStatus;
  goal: string;
  engine: BrowserEngine;
  mode: BrowserSessionMode;
  currentUrl: string;
  plan: BrowserPlan | null;
  timeline: TimelineEvent[];
  screenshots: Array<Omit<ScreenshotRecord, "data"> & { previewUrl?: string }>;
  latestScreenshotId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  pendingApproval: PendingApprovalPublic | null;
}

export interface PendingApprovalPublic {
  approvalId: string;
  runId: string;
  origin: string;
  goal: string;
  steps: Array<{ id: string; action: BrowserStepAction; label: string; dangerous?: boolean; dangerReason?: string }>;
  dangerousSteps: Array<{ id: string; label: string; dangerReason?: string }>;
  createdAt: string;
  expiresAt: string;
}

export interface BrowserActionInput {
  action: BrowserStepAction;
  url?: string;
  selector?: string;
  value?: string;
  filePath?: string;
  timeoutMs?: number;
  label?: string;
}

export interface RunBrowserRequest {
  userId: string;
  goal?: string;
  steps?: BrowserActionInput[];
  url?: string;
  engine?: BrowserEngine;
  mode?: BrowserSessionMode;
  persistCookies?: boolean;
  headless?: boolean;
  /** When true, skip waiting and fail if approval is required. */
  dryRun?: boolean;
  approvalTimeoutMs?: number;
  /** Pre-approved choice for automated tests only. */
  autoApprove?: PermissionChoice | null;
}

export interface BrowserLogEvent {
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}
