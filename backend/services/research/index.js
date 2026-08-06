/**
 * Deep Research public API.
 */

export { RESEARCH_CONFIG, RESEARCH_STATUS } from "./config.js";
export { planResearch } from "./researchPlanner.js";
export { searchWeb, searchMany, dedupeHits } from "./searchService.js";
export { fetchSources, fetchOneSource, htmlToText } from "./sourceFetcher.js";
export {
  rankSources,
  dedupeByContent,
  detectContradictions,
  computeConfidence,
} from "./sourceRanker.js";
export { generateReport } from "./reportGenerator.js";
export {
  assignCitations,
  buildReferencesMarkdown,
  buildCitationList,
  ensureReferences,
} from "./citationGenerator.js";
export {
  ResearchSession,
  getResearchSession,
  rememberSession,
  researchSessions,
} from "./researchSession.js";
export {
  runDeepResearch,
  resumeDeepResearch,
} from "./researchOrchestrator.js";
export { analyzeResearchWithCode } from "./codeAnalysis.js";
