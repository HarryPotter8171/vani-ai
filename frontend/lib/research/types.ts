/** Deep Research domain types */

import { getUserFriendlyError } from '@/lib/userFacingError';

export type ResearchPhase =
  | 'planning'
  | 'searching'
  | 'reading'
  | 'comparing'
  | 'verifying'
  | 'writing'
  | 'completed';

export type ResearchStatus =
  | 'idle'
  | 'planning'
  | 'searching'
  | 'reading'
  | 'comparing'
  | 'verifying'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface ResearchPlan {
  title: string;
  objective: string;
  angles: string[];
  queries: string[];
  mustVerify: string[];
  followUpQuestions: string[];
}

export interface ResearchSource {
  citationId?: number;
  citationLabel?: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  ok?: boolean;
  provider?: string;
  error?: string;
}

export interface ResearchCitation {
  id: number;
  label: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  provider?: string;
  hostname?: string;
}

export interface ResearchContradiction {
  claim: string;
  sides: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface ResearchTimelineEntry {
  id: string;
  at: number;
  kind: string;
  label: string;
  detail?: string;
  status?: string;
  phase?: string;
}

export interface ResearchState {
  sessionId: string | null;
  query: string;
  status: ResearchStatus;
  phase: ResearchPhase | string | null;
  progress: number;
  etaSeconds: number | null;
  plan: ResearchPlan | null;
  sources: ResearchSource[];
  timeline: ResearchTimelineEntry[];
  contradictions: ResearchContradiction[];
  citations: ResearchCitation[];
  followUpQuestions: string[];
  providers: string[];
  report: string;
  confidence: number | null;
  error: string | null;
  chatId: string | null;
}

export type ResearchStreamEventType =
  | 'session_start'
  | 'phase'
  | 'progress'
  | 'timeline'
  | 'plan'
  | 'search_done'
  | 'source'
  | 'contradictions'
  | 'confidence'
  | 'code_analysis'
  | 'delta'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'paused'
  | 'resumed'
  | 'status'
  | 'done';

export interface ResearchStreamEvent {
  type: ResearchStreamEventType | string;
  sessionId?: string;
  chatId?: string;
  query?: string;
  status?: ResearchStatus;
  phase?: string;
  label?: string;
  detail?: string;
  progress?: number;
  etaSeconds?: number;
  plan?: ResearchPlan;
  entry?: ResearchTimelineEntry;
  source?: ResearchSource;
  sources?: ResearchSource[];
  contradictions?: ResearchContradiction[];
  confidence?: number;
  delta?: string;
  /** When true, `delta` replaces the accumulated report instead of appending. */
  replace?: boolean;
  report?: string;
  citations?: ResearchCitation[];
  followUpQuestions?: string[];
  providers?: string[];
  resultCount?: number;
  error?: string;
  reason?: string;
  done?: boolean;
  /** Optional Code Interpreter analysis payload from the verifying phase. */
  stdout?: string;
}

export const RESEARCH_PHASES: Array<{ id: ResearchPhase; label: string }> = [
  { id: 'planning', label: 'Planning' },
  { id: 'searching', label: 'Searching' },
  { id: 'reading', label: 'Reading' },
  { id: 'comparing', label: 'Comparing' },
  { id: 'verifying', label: 'Verifying' },
  { id: 'writing', label: 'Writing report' },
];

export function createEmptyResearchState(): ResearchState {
  return {
    sessionId: null,
    query: '',
    status: 'idle',
    phase: null,
    progress: 0,
    etaSeconds: null,
    plan: null,
    sources: [],
    timeline: [],
    contradictions: [],
    citations: [],
    followUpQuestions: [],
    providers: [],
    report: '',
    confidence: null,
    error: null,
    chatId: null,
  };
}

/**
 * Map a GET /research/sessions/:id payload (live or persisted) into UI state.
 * Used to restore interrupted-session chrome after reload.
 */
export function hydrateResearchStateFromSession(
  session: Record<string, unknown> | null | undefined
): ResearchState {
  const empty = createEmptyResearchState();
  if (!session || typeof session !== 'object') return empty;

  const statusRaw = String(session.status || 'idle');
  const status = (
    [
      'idle',
      'planning',
      'searching',
      'reading',
      'comparing',
      'verifying',
      'writing',
      'completed',
      'failed',
      'cancelled',
      'paused',
    ] as ResearchStatus[]
  ).includes(statusRaw as ResearchStatus)
    ? (statusRaw as ResearchStatus)
    : 'idle';

  return {
    ...empty,
    sessionId: String(session.id || session.sessionId || '') || null,
    query: String(session.query || ''),
    status,
    phase: (session.phase as string) || null,
    progress: typeof session.progress === 'number' ? session.progress : 0,
    plan: (session.plan as ResearchPlan) || null,
    sources: Array.isArray(session.sources)
      ? (session.sources as ResearchSource[])
      : [],
    timeline: Array.isArray(session.timeline)
      ? (session.timeline as ResearchTimelineEntry[])
      : [],
    contradictions: Array.isArray(session.contradictions)
      ? (session.contradictions as ResearchContradiction[])
      : [],
    citations: Array.isArray(session.citations)
      ? (session.citations as ResearchCitation[])
      : [],
    followUpQuestions: Array.isArray(session.followUpQuestions)
      ? (session.followUpQuestions as string[])
      : [],
    providers: Array.isArray(session.providers)
      ? (session.providers as string[])
      : [],
    report: String(session.report || ''),
    confidence:
      typeof session.confidence === 'number' ? session.confidence : null,
    error: session.error ? String(session.error) : null,
    chatId: session.chatId ? String(session.chatId) : null,
  };
}

export function reduceResearchState(
  prev: ResearchState,
  event: ResearchStreamEvent
): ResearchState {
  const next: ResearchState = { ...prev };

  if (event.sessionId) next.sessionId = event.sessionId;
  if (event.chatId) next.chatId = event.chatId;
  if (typeof event.progress === 'number') next.progress = event.progress;
  if (typeof event.etaSeconds === 'number') next.etaSeconds = event.etaSeconds;
  if (event.status) next.status = event.status;
  if (event.phase) next.phase = event.phase;
  if (event.query) next.query = event.query;

  switch (event.type) {
    case 'session_start':
      next.status = 'planning';
      next.progress = 0;
      next.report = '';
      next.error = null;
      next.sources = [];
      next.timeline = [];
      next.citations = [];
      next.contradictions = [];
      break;
    case 'plan':
      if (event.plan) {
        next.plan = event.plan;
        next.followUpQuestions = event.plan.followUpQuestions || [];
      }
      break;
    case 'timeline':
      if (event.entry) next.timeline = [...next.timeline, event.entry];
      break;
    case 'source':
      if (event.source) {
        const exists = next.sources.some((s) => s.url === event.source!.url);
        next.sources = exists
          ? next.sources.map((s) => (s.url === event.source!.url ? { ...s, ...event.source } : s))
          : [...next.sources, event.source];
      }
      break;
    case 'search_done':
      if (event.providers) next.providers = event.providers;
      break;
    case 'contradictions':
      if (event.contradictions) next.contradictions = event.contradictions;
      break;
    case 'confidence':
      if (typeof event.confidence === 'number') next.confidence = event.confidence;
      break;
    case 'code_analysis': {
      // Orchestrator also pushes a timeline row; keep a fallback if it arrives alone.
      const detail = String(event.stdout || event.detail || '').slice(0, 240);
      if (detail && !next.timeline.some((e) => e.kind === 'analyze')) {
        next.timeline = [
          ...next.timeline,
          {
            id: `code-analysis-${Date.now()}`,
            at: Date.now(),
            kind: 'analyze',
            label: 'Code Interpreter analysis',
            detail,
            status: 'completed',
            phase: 'verifying',
          },
        ];
      }
      if (typeof event.progress === 'number') next.progress = event.progress;
      break;
    }
    case 'delta':
      if (event.delta) {
        next.report = event.replace ? event.delta : next.report + event.delta;
      }
      next.status = 'writing';
      break;
    case 'completed':
      next.status = 'completed';
      next.progress = 100;
      next.etaSeconds = 0;
      if (event.report) next.report = event.report;
      if (event.citations) next.citations = event.citations;
      if (event.followUpQuestions) next.followUpQuestions = event.followUpQuestions;
      if (event.contradictions) next.contradictions = event.contradictions;
      if (event.sources) next.sources = event.sources;
      if (typeof event.confidence === 'number') next.confidence = event.confidence;
      break;
    case 'error':
      next.status = 'failed';
      next.error = getUserFriendlyError(event.error, {
        feature: 'research',
        fallback: 'Research failed',
      });
      break;
    case 'cancelled':
      next.status = 'cancelled';
      next.error = event.reason || 'Stopped';
      break;
    case 'paused':
      next.status = 'paused';
      break;
    case 'resumed':
      next.status = (event.phase as ResearchStatus) || 'planning';
      break;
    default:
      break;
  }

  return next;
}
