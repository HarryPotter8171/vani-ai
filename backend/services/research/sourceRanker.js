/**
 * Source ranking, deduplication, and contradiction detection.
 */

import { CHAT_MODEL, getGeminiClient } from "../geminiClient.js";
import { RESEARCH_CONFIG } from "./config.js";

const AUTHORITY_HOSTS = [
  { re: /\.(gov|edu)(\.|$)/i, boost: 0.25 },
  { re: /(wikipedia\.org|britannica\.com|nature\.com|science\.org|nih\.gov|who\.int|un\.org)/i, boost: 0.2 },
  { re: /(reuters\.com|apnews\.com|bbc\.(com|co\.uk)|nytimes\.com|wsj\.com|economist\.com|ft\.com)/i, boost: 0.15 },
  { re: /(arxiv\.org|ssrn\.com|ieee\.org|acm\.org|springer\.com|wiley\.com|sciencedirect\.com)/i, boost: 0.18 },
  { re: /(medium\.com|blogspot\.|wordpress\.|substack\.com|quora\.com|reddit\.com)/i, boost: -0.12 },
];

/**
 * Rank fetched sources by relevance, authority, and extract quality.
 * @param {Array<object>} sources
 * @param {{ query: string, angles?: string[] }} context
 */
export function rankSources(sources, context = {}) {
  const query = String(context.query || "").toLowerCase();
  const terms = query
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 2)
    .slice(0, 12);

  const scored = (sources || [])
    .filter((s) => s && (s.ok !== false || s.text || s.snippet))
    .map((source, index) => {
      const text = `${source.title || ""} ${source.snippet || ""} ${source.text || ""}`.toLowerCase();
      let score = 0.35;

      // Term overlap
      let hits = 0;
      for (const term of terms) {
        if (text.includes(term)) hits += 1;
      }
      if (terms.length) score += (hits / terms.length) * 0.35;

      // Extract richness
      const len = (source.text || "").length;
      if (len > 1500) score += 0.12;
      else if (len > 400) score += 0.06;
      else if (len < 80) score -= 0.1;

      // Fetch success
      if (source.ok) score += 0.08;
      else score -= 0.15;

      // Host authority
      try {
        const host = new URL(source.url).hostname;
        for (const rule of AUTHORITY_HOSTS) {
          if (rule.re.test(host)) {
            score += rule.boost;
            break;
          }
        }
      } catch {
        score -= 0.05;
      }

      // Prefer earlier search hits slightly (providers often rank already)
      score += Math.max(0, 0.05 - index * 0.004);

      return {
        ...source,
        score: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
      };
    })
    .sort((a, b) => b.score - a.score);

  return dedupeByContent(scored).slice(0, RESEARCH_CONFIG.maxSourcesInReport);
}

/**
 * Near-duplicate removal by host+path and text fingerprint.
 */
export function dedupeByContent(sources) {
  const seenUrls = new Set();
  const fingerprints = [];
  const out = [];

  for (const source of sources || []) {
    let urlKey = "";
    try {
      const u = new URL(source.url);
      urlKey = `${u.hostname.replace(/^www\./, "")}${u.pathname}`.toLowerCase();
    } catch {
      urlKey = String(source.url || "").toLowerCase();
    }
    if (seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);

    const fp = fingerprint(source.text || source.snippet || source.title || "");
    if (fp && fingerprints.some((f) => jaccard(f, fp) > 0.82)) continue;
    if (fp) fingerprints.push(fp);

    out.push(source);
  }
  return out;
}

function fingerprint(text) {
  const tokens = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 80);
  return new Set(tokens);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/**
 * Detect contradictions across ranked sources using the model.
 * @param {string} query
 * @param {Array<object>} sources
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function detectContradictions(query, sources, { signal } = {}) {
  const top = (sources || []).slice(0, 8);
  if (top.length < 2) {
    return { contradictions: [], confidenceHint: null };
  }

  const briefs = top
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\n${(s.text || s.snippet || "").slice(0, 900)}`
    )
    .join("\n\n---\n\n");

  const prompt = `Compare these sources about: "${query}"

Identify factual contradictions or significant disagreements (not mere differences in emphasis).

Return ONLY JSON:
{
  "contradictions": [
    { "claim": "...", "sides": ["source A says...", "source B says..."], "severity": "low|medium|high" }
  ],
  "agreementSummary": "brief note on what sources largely agree on"
}

If none, return {"contradictions":[],"agreementSummary":"..."}.

Sources:
${briefs}`;

  try {
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        abortSignal: signal,
      },
    });
    const parsed = JSON.parse(extractJson(response.text || "{}"));
    const contradictions = Array.isArray(parsed.contradictions)
      ? parsed.contradictions.slice(0, 6).map((c) => ({
          claim: String(c.claim || "").slice(0, 300),
          sides: Array.isArray(c.sides)
            ? c.sides.map((s) => String(s).slice(0, 240))
            : [],
          severity: ["low", "medium", "high"].includes(c.severity)
            ? c.severity
            : "medium",
        }))
      : [];
    return {
      contradictions,
      agreementSummary: String(parsed.agreementSummary || "").slice(0, 400),
    };
  } catch {
    return { contradictions: [], agreementSummary: "" };
  }
}

/**
 * Overall confidence score from source quality + contradiction load.
 */
export function computeConfidence({ sources = [], contradictions = [] } = {}) {
  if (!sources.length) return 0.2;

  const avgScore =
    sources.reduce((sum, s) => sum + (s.score || 0.4), 0) / sources.length;
  const okRatio =
    sources.filter((s) => s.ok !== false).length / Math.max(1, sources.length);
  const diversity = Math.min(1, new Set(
    sources.map((s) => {
      try {
        return new URL(s.url).hostname.replace(/^www\./, "");
      } catch {
        return s.url;
      }
    })
  ).size / 5);

  let confidence = avgScore * 0.45 + okRatio * 0.25 + diversity * 0.2 + 0.1;

  const high = contradictions.filter((c) => c.severity === "high").length;
  const med = contradictions.filter((c) => c.severity === "medium").length;
  confidence -= high * 0.08 + med * 0.04;

  return Math.max(0.15, Math.min(0.95, Number(confidence.toFixed(2))));
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : "{}";
}
