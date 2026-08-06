/**
 * Final research report generation with inline citations + confidence.
 */

import { CHAT_MODEL, getGeminiClient } from "../geminiClient.js";
import { VANI_IDENTITY_LOCK } from "../identity.js";
import {
  createIdentityStreamGuard,
  sanitizeIdentityResponse,
} from "../identity/IdentityGuard.js";
import { RESEARCH_CONFIG } from "./config.js";
import {
  assignCitations,
  buildCitationList,
  ensureReferences,
} from "./citationGenerator.js";

/**
 * @param {object} input
 * @param {string} input.query
 * @param {object} input.plan
 * @param {Array<object>} input.sources
 * @param {Array<object>} [input.contradictions]
 * @param {number} [input.confidence]
 * @param {string} [input.agreementSummary]
 * @param {{ signal?: AbortSignal, onDelta?: (text: string) => void }} [opts]
 */
export async function generateReport(input, { signal, onDelta } = {}) {
  const {
    query,
    plan,
    sources = [],
    contradictions = [],
    confidence = 0.5,
    agreementSummary = "",
  } = input;

  const cited = assignCitations(sources.slice(0, RESEARCH_CONFIG.maxSourcesInReport));
  let extractBudget = RESEARCH_CONFIG.maxTotalExtractChars;
  const sourceBlock = cited
    .map((s) => {
      const raw = s.text || s.snippet || "";
      const cap = Math.min(1800, Math.max(0, extractBudget));
      const extract = raw.slice(0, cap);
      extractBudget -= extract.length;
      return `[${s.citationId}] ${s.title}\nURL: ${s.url}\nScore: ${s.score ?? "?"}\nExtract:\n${extract}`;
    })
    .join("\n\n---\n\n");

  const contradictionBlock = contradictions.length
    ? contradictions
        .map(
          (c) =>
            `- (${c.severity}) ${c.claim}\n  ${((c.sides || []).join(" | "))}`
        )
        .join("\n")
    : "None detected.";

  const prompt = `You are VANI AI writing a Deep Research report.
${VANI_IDENTITY_LOCK}

Research question: ${query}
Objective: ${plan?.objective || query}
Angles covered: ${(plan?.angles || []).join("; ")}
Overall confidence score (0-1): ${confidence}
Agreement note: ${agreementSummary || "n/a"}

Write a rigorous, editorial-quality Markdown report for a demanding reader.

Required structure:
1. # Title
2. ## Executive summary (3-6 sentences; state confidence qualitatively)
3. ## Key findings (bullets with inline citations like [1], [2])
4. ## Analysis (multi-paragraph synthesis; cite sources)
5. ## Conflicting evidence (honest about disagreements)
6. ## Limitations
7. ## Conclusion
8. Do NOT invent a References section — it will be appended automatically.

Rules:
- Every non-obvious factual claim MUST include an inline citation [n] matching the source list.
- Never fabricate URLs or citation numbers.
- Prefer primary/authoritative sources when sources disagree.
- Be precise, calm, and specific — no filler.
- If evidence is thin, say so explicitly.

Detected contradictions:
${contradictionBlock}

Sources:
${sourceBlock || "(no sources)"}`;

  let report = "";
  const identityGuard = createIdentityStreamGuard(query);

  const emitSanitized = (rawChunk, replace = false) => {
    const out = identityGuard.push(rawChunk || "", replace);
    if (!out?.text) return;
    onDelta?.(out.text, { replace: !!out.replace });
  };

  try {
    const stream = await getGeminiClient().models.generateContentStream({
      model: CHAT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { abortSignal: signal },
    });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const text = chunk.text;
      if (text) {
        report += text;
        emitSanitized(text);
      }
    }
    const trailing = identityGuard.flush();
    if (trailing?.text) onDelta?.(trailing.text, { replace: !!trailing.replace });
  } catch (err) {
    if (signal?.aborted) throw err;
    // Non-streaming fallback
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { abortSignal: signal },
    });
    report = response.text || "";
    if (report) emitSanitized(report, true);
  }

  if (!report.trim()) {
    report = buildFallbackReport(query, cited, confidence);
    emitSanitized(report, true);
  }

  // Absolute last identity pass before the report reaches SSE / chat / API.
  report = sanitizeIdentityResponse(report.trim(), query);
  const finalMarkdown = ensureReferences(report, cited);
  const citations = buildCitationList(cited);

  return {
    markdown: finalMarkdown,
    citations,
    citedSources: cited,
    confidence,
    followUpQuestions: plan?.followUpQuestions || [],
  };
}

function buildFallbackReport(query, cited, confidence) {
  const bullets = cited
    .slice(0, 5)
    .map(
      (s) =>
        `- ${(s.snippet || s.title || "").slice(0, 180)} ${s.citationLabel}`
    )
    .join("\n");

  return `# Research report: ${query}

## Executive summary
Automated synthesis with confidence ${Math.round(confidence * 100)}%. Evidence was gathered from ${cited.length} sources.

## Key findings
${bullets || "- Insufficient source material was available."}

## Analysis
See cited extracts above. Manual review of primary sources is recommended when stakes are high.

## Conflicting evidence
See research timeline for detected contradictions.

## Limitations
Some pages could not be fetched or lacked extractable text.

## Conclusion
Treat this as a starting brief; verify critical claims against primary documents.
`;
}
