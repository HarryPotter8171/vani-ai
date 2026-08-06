/**
 * Deep Research configuration — tuned for reliability over raw speed.
 */

export const RESEARCH_CONFIG = {
  maxSearchQueries: 6,
  maxResultsPerQuery: 6,
  maxSourcesToFetch: 12,
  maxSourcesInReport: 10,
  fetchConcurrency: 4,
  fetchTimeoutMs: 12_000,
  searchTimeoutMs: 15_000,
  maxRetries: 2,
  retryDelayMs: 600,
  maxExtractChars: 6_000,
  maxTotalExtractChars: 40_000,
  cacheTtlMs: 30 * 60 * 1000,
  sessionTtlMs: 2 * 60 * 60 * 1000,
  estimatedPhaseSeconds: {
    planning: 8,
    searching: 18,
    reading: 25,
    comparing: 10,
    verifying: 12,
    writing: 20,
  },
  phases: [
    "planning",
    "searching",
    "reading",
    "comparing",
    "verifying",
    "writing",
  ],
  phaseLabels: {
    planning: "Planning",
    searching: "Searching",
    reading: "Reading",
    comparing: "Comparing",
    verifying: "Verifying",
    writing: "Writing report",
  },
};

export const RESEARCH_STATUS = {
  IDLE: "idle",
  PLANNING: "planning",
  SEARCHING: "searching",
  READING: "reading",
  COMPARING: "comparing",
  VERIFYING: "verifying",
  WRITING: "writing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  PAUSED: "paused",
};

export const TERMINAL_RESEARCH_STATUS = new Set([
  RESEARCH_STATUS.COMPLETED,
  RESEARCH_STATUS.FAILED,
  RESEARCH_STATUS.CANCELLED,
]);
