export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';
export type BrowserSessionMode = 'isolated' | 'persistent' | 'private';
export type PermissionChoice = 'allow_once' | 'always_allow' | 'deny';

export type BrowserRunStatus =
  | 'idle'
  | 'awaiting_approval'
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TimelineEventKind =
  | 'opening'
  | 'loading'
  | 'clicking'
  | 'typing'
  | 'reading'
  | 'uploading'
  | 'downloading'
  | 'scrolling'
  | 'waiting'
  | 'screenshot'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'failed'
  | 'info'
  | 'warning'
  | 'approval';

export interface BrowserTimelineEvent {
  id: string;
  kind: TimelineEventKind;
  message: string;
  at: string;
  stepId?: string;
  meta?: Record<string, unknown>;
}

export interface BrowserStepSummary {
  id: string;
  action: string;
  label: string;
  dangerous?: boolean;
  dangerReason?: string;
  status?: string;
  url?: string;
}

export interface BrowserPlan {
  id: string;
  goal: string;
  origin?: string;
  steps: BrowserStepSummary[];
  createdAt: string;
}

export interface BrowserScreenshotSummary {
  id: string;
  at: string;
  url: string;
  stepId?: string;
  mimeType: string;
  previewUrl?: string;
}

export interface PendingApproval {
  approvalId: string;
  runId: string;
  origin: string;
  goal: string;
  steps: BrowserStepSummary[];
  dangerousSteps: Array<{ id: string; label: string; dangerReason?: string }>;
  createdAt: string;
  expiresAt: string;
}

export interface BrowserRun {
  runId: string;
  sessionId: string | null;
  userId: string;
  status: BrowserRunStatus;
  goal: string;
  engine: BrowserEngine;
  mode: BrowserSessionMode;
  currentUrl: string;
  plan: BrowserPlan | null;
  timeline: BrowserTimelineEvent[];
  screenshots: BrowserScreenshotSummary[];
  latestScreenshotId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  pendingApproval: PendingApproval | null;
}

export interface StartBrowserRunInput {
  goal?: string;
  url?: string;
  steps?: Array<{
    action: string;
    url?: string;
    selector?: string;
    value?: string;
    filePath?: string;
    label?: string;
    timeoutMs?: number;
  }>;
  engine?: BrowserEngine;
  mode?: BrowserSessionMode;
  persistCookies?: boolean;
}

export interface BrowserPermission {
  userId: string;
  origin: string;
  alwaysAllow: boolean;
  alwaysDeny: boolean;
  updatedAt?: string;
}
