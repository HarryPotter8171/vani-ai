/**
 * Deep Research orchestrator — end-to-end multi-phase pipeline.
 *
 * User Query → Plan → Search → Fetch → Rank/Compare → Verify → Report + Citations
 */

import { planResearch } from "./researchPlanner.js";
import { searchMany } from "./searchService.js";
import { fetchSources } from "./sourceFetcher.js";
import {
  computeConfidence,
  detectContradictions,
  rankSources,
} from "./sourceRanker.js";
import { generateReport } from "./reportGenerator.js";
import { RESEARCH_CONFIG, RESEARCH_STATUS } from "./config.js";
import {
  ResearchSession,
  rememberSession,
} from "./researchSession.js";
import { analyzeResearchWithCode } from "./codeAnalysis.js";

/**
 * Create and run a research session, emitting SSE-friendly events via session.on().
 * @param {object} options
 */
export async function runDeepResearch({
  query,
  userId = null,
  chatId = null,
  projectId = null,
  sessionId = null,
  resumeSession = null,
  onEvent,
} = {}) {
  const session =
    resumeSession ||
    new ResearchSession({ query, userId, chatId, projectId, sessionId });

  rememberSession(session);

  if (typeof onEvent === "function") {
    session.on(onEvent);
  }

  session.startedAt = session.startedAt || Date.now();
  session.emit({
    type: "session_start",
    sessionId: session.id,
    query: session.query,
    status: session.status,
    progress: 0,
  });

  try {
    await runPipelineExclusive(session);
  } catch (err) {
    if (session.isCancelled) {
      session.emit({ type: "done", sessionId: session.id, status: session.status });
      return session;
    }
    if (!session.isTerminal) session.fail(err);
    session.emit({ type: "done", sessionId: session.id, status: session.status });
    return session;
  }

  session.emit({ type: "done", sessionId: session.id, status: session.status });
  return session;
}

/**
 * Ensure only one executePipeline runs per session (resume must not fork).
 * @param {ResearchSession} session
 */
async function runPipelineExclusive(session) {
  if (session._pipelinePromise) {
    await session._pipelinePromise;
    return;
  }
  session._pipelinePromise = executePipeline(session).finally(() => {
    session._pipelinePromise = null;
  });
  await session._pipelinePromise;
}

async function executePipeline(session) {
  const startPhase = session.resumeFromPhase || "planning";
  const phases = RESEARCH_CONFIG.phases;
  const startIdx = Math.max(0, phases.indexOf(startPhase));

  // Shared pipeline state (survives resume within the same process session)
  let plan = session.plan;
  let searchHits = session._searchHits || [];
  let fetched = session._fetched || [];
  let ranked = session.sources?.length ? session.sources : [];
  let contradictions = session.contradictions || [];
  let agreementSummary = session._agreementSummary || "";
  let confidence = session.confidence;

  for (let i = startIdx; i < phases.length; i += 1) {
    if (!(await session.waitIfPaused()) || session.isCancelled) {
      if (!session.isCancelled) session.cancel("Stopped");
      return;
    }

    const phase = phases[i];
    session.resumeFromPhase = phase;

    switch (phase) {
      case "planning": {
        session.setPhase("planning", "Building search strategy");
        session.setProgress(4, "Planning");
        plan = await planResearch(session.query, { signal: session.signal });
        session.plan = plan;
        session.followUpQuestions = plan.followUpQuestions || [];
        session.setProgress(12, "Plan ready");
        session.emit({ type: "plan", plan, progress: session.progress });
        break;
      }

      case "searching": {
        session.setPhase("searching", "Running multi-provider search");
        session.setProgress(18, "Searching");
        const queries = plan?.queries || [session.query];
        const searchResult = await searchMany(queries, {
          signal: session.signal,
          onQueryDone: (payload) => {
            session.pushTimeline({
              kind: "search",
              label: `Searched: ${payload.query}`,
              detail: `${payload.results.length} hits · ${payload.providers.join(", ") || "none"}`,
              status: "completed",
            });
            session.setProgress(
              Math.min(38, session.progress + 3),
              payload.query
            );
          },
        });
        searchHits = searchResult.results;
        session._searchHits = searchHits;
        session.providers = searchResult.providers;
        session.setProgress(40, "Search complete");
        session.emit({
          type: "search_done",
          resultCount: searchHits.length,
          providers: session.providers,
          progress: session.progress,
        });
        break;
      }

      case "reading": {
        session.setPhase("reading", "Opening and extracting pages");
        session.setProgress(45, "Reading sources");
        const toFetch = searchHits.slice(0, RESEARCH_CONFIG.maxSourcesToFetch);
        fetched = await fetchSources(toFetch, {
          signal: session.signal,
          onFetched: (src) => {
            session.pushTimeline({
              kind: "read",
              label: src.ok ? `Read: ${src.title}` : `Skipped: ${src.title}`,
              detail: src.ok ? src.url : src.error,
              status: src.ok ? "completed" : "failed",
            });
            if (src.ok) {
              session.setProgress(
                Math.min(62, session.progress + 2),
                src.title
              );
            }
          },
        });
        session._fetched = fetched;
        session.setProgress(64, "Reading complete");
        break;
      }

      case "comparing": {
        session.setPhase("comparing", "Ranking and deduplicating");
        session.setProgress(68, "Comparing");
        ranked = rankSources(fetched, {
          query: session.query,
          angles: plan?.angles,
        });
        // Preserve provider from original hit when available
        const byUrl = new Map(searchHits.map((h) => [h.url, h]));
        ranked = ranked.map((s) => ({
          ...s,
          provider: s.provider || byUrl.get(s.url)?.provider,
        }));
        session.sources = ranked;
        for (const s of ranked) session.emit({ type: "source", source: {
          title: s.title,
          url: s.url,
          snippet: (s.snippet || "").slice(0, 280),
          score: s.score,
          ok: s.ok,
          provider: s.provider,
        }, progress: session.progress });

        const comparison = await detectContradictions(session.query, ranked, {
          signal: session.signal,
        });
        contradictions = comparison.contradictions || [];
        agreementSummary = comparison.agreementSummary || "";
        session.contradictions = contradictions;
        session._agreementSummary = agreementSummary;
        if (contradictions.length) {
          session.emit({
            type: "contradictions",
            contradictions,
            progress: session.progress,
          });
        }
        session.setProgress(78, "Comparison complete");
        break;
      }

      case "verifying": {
        session.setPhase("verifying", "Cross-checking key claims");
        session.setProgress(82, "Verifying");
        confidence = computeConfidence({ sources: ranked, contradictions });
        session.confidence = confidence;
        session.pushTimeline({
          kind: "verify",
          label: `Confidence ${Math.round(confidence * 100)}%`,
          detail: `${ranked.length} sources · ${contradictions.length} contradictions`,
          status: "completed",
        });
        session.emit({
          type: "confidence",
          confidence,
          progress: session.progress,
        });

        // Optional quantitative pass via Code Interpreter (no-op when disabled).
        if (session.userId) {
          const analysis = await analyzeResearchWithCode({
            userId: String(session.userId),
            query: session.query,
            sources: ranked,
          });
          if (analysis.ok && analysis.stdout) {
            session._codeAnalysis = analysis.stdout;
            session.pushTimeline({
              kind: "analyze",
              label: "Code Interpreter analysis",
              detail: analysis.stdout.slice(0, 240),
              status: "completed",
            });
            session.emit({
              type: "code_analysis",
              stdout: analysis.stdout,
              sessionId: analysis.sessionId,
              progress: session.progress,
            });
          }
        }

        session.setProgress(86, "Verified");
        break;
      }

      case "writing": {
        session.setPhase("writing", "Writing cited report");
        session.setProgress(88, "Writing report");
        session.status = RESEARCH_STATUS.WRITING;

        const result = await generateReport(
          {
            query: session.query,
            plan,
            sources: ranked,
            contradictions,
            confidence,
            agreementSummary,
          },
          {
            signal: session.signal,
            onDelta: (text, meta = {}) => {
              if (meta.replace) {
                session.report = text;
              } else {
                session.report += text;
              }
              session.emit({
                type: "delta",
                delta: text,
                ...(meta.replace ? { replace: true } : {}),
                progress: session.progress,
              });
            },
          }
        );

        // generateReport already streamed into session.report via onDelta —
        // replace with the finalized markdown (includes references).
        session.report = result.markdown;
        // Keep session.sources aligned with citation numbers used in the report.
        if (result.citedSources?.length) {
          const byUrl = new Map(
            result.citedSources.map((s) => [s.url, s])
          );
          session.sources = ranked.map((s) => {
            const cited = byUrl.get(s.url);
            return cited
              ? {
                  ...s,
                  citationId: cited.citationId,
                  citationLabel: cited.citationLabel,
                }
              : s;
          });
        }
        session.complete({
          report: result.markdown,
          citations: result.citations,
          confidence: result.confidence,
          followUpQuestions: result.followUpQuestions,
          contradictions,
        });
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Resume a paused/interrupted in-memory session.
 */
export async function resumeDeepResearch(sessionId, { onEvent } = {}) {
  const { getResearchSession } = await import("./researchSession.js");
  const session = getResearchSession(sessionId);
  if (!session) return { ok: false, error: "Session not found" };
  if (session.isTerminal) {
    return { ok: false, error: "Session already finished" };
  }

  if (session.isPaused) session.resume();

  // Re-attach listener and continue pipeline from resumeFromPhase
  if (typeof onEvent === "function") session.on(onEvent);

  session.emit({
    type: "resumed",
    sessionId: session.id,
    phase: session.resumeFromPhase || session.phase,
    progress: session.progress,
  });

  try {
    // If the original run is still blocked in waitIfPaused, join it —
    // do not start a second executePipeline on the same session.
    await runPipelineExclusive(session);
  } catch (err) {
    if (!session.isCancelled && !session.isTerminal) session.fail(err);
  }

  session.emit({ type: "done", sessionId: session.id, status: session.status });
  return { ok: true, session };
}
