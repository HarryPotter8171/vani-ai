/**
 * Research Planner — turns a user query into a multi-step search strategy.
 */

import { CHAT_MODEL, getGeminiClient } from "../geminiClient.js";
import { VANI_IDENTITY_LOCK } from "../identity.js";
import { RESEARCH_CONFIG } from "./config.js";

/**
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function planResearch(query, { signal } = {}) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    throw new Error("Research query is required");
  }

  const prompt = `You are VANI AI's Deep Research planner.
${VANI_IDENTITY_LOCK}

Given the user's research question, produce a rigorous multi-angle search strategy.

Return ONLY valid JSON with this shape:
{
  "title": "short research title",
  "objective": "1-2 sentence research objective",
  "angles": ["aspect 1", "aspect 2"],
  "queries": ["search query 1", "search query 2"],
  "mustVerify": ["claim or fact that must be cross-checked"],
  "followUpQuestions": ["useful follow-up the user may ask next"]
}

Rules:
- Produce 3-${RESEARCH_CONFIG.maxSearchQueries} diverse, high-signal search queries (not near-duplicates).
- Cover primary facts, recent developments, opposing views, and authoritative sources.
- Prefer queries that will surface primary sources, official docs, and reputable journalism.
- keep mustVerify to 2-5 concrete items.
- followUpQuestions: 3 thoughtful next questions.

User question:
${trimmed}`;

  try {
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        abortSignal: signal,
      },
    });

    const text = response.text || "";
    const parsed = JSON.parse(extractJson(text));
    return normalizePlan(parsed, trimmed);
  } catch (err) {
    if (signal?.aborted) throw err;
    // Deterministic fallback so research can still proceed without the planner model.
    return fallbackPlan(trimmed);
  }
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : "{}";
}

function normalizePlan(parsed, query) {
  const queries = uniqueStrings(parsed?.queries)
    .slice(0, RESEARCH_CONFIG.maxSearchQueries);
  const angles = uniqueStrings(parsed?.angles).slice(0, 6);
  const mustVerify = uniqueStrings(parsed?.mustVerify).slice(0, 5);
  const followUpQuestions = uniqueStrings(parsed?.followUpQuestions).slice(0, 4);

  return {
    title: String(parsed?.title || query).slice(0, 120).trim() || query.slice(0, 80),
    objective:
      String(parsed?.objective || `Investigate: ${query}`).slice(0, 400).trim(),
    angles: angles.length ? angles : ["Overview", "Evidence", "Counterpoints"],
    queries: queries.length ? queries : [query, `${query} latest research`, `${query} criticism`],
    mustVerify: mustVerify.length ? mustVerify : [`Key facts about: ${query}`],
    followUpQuestions: followUpQuestions.length
      ? followUpQuestions
      : [
          `What are the strongest counterarguments to the main conclusion?`,
          `Which primary sources are most authoritative here?`,
          `What changed recently on this topic?`,
        ],
  };
}

function fallbackPlan(query) {
  return {
    title: query.slice(0, 80),
    objective: `Investigate: ${query}`,
    angles: ["Overview", "Evidence", "Recent developments", "Counterpoints"],
    queries: [
      query,
      `${query} latest`,
      `${query} analysis`,
      `${query} official statistics`,
      `${query} criticism OR limitations`,
    ].slice(0, RESEARCH_CONFIG.maxSearchQueries),
    mustVerify: [`Core claims related to: ${query}`],
    followUpQuestions: [
      `What are the strongest counterarguments?`,
      `Which sources are most authoritative?`,
      `What are the latest developments?`,
    ],
  };
}

function uniqueStrings(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = String(item || "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
